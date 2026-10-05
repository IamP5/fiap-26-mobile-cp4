// Package httpx contains the small HTTP toolkit shared by the handlers:
// JSON responses, typed API errors and middleware.
package httpx

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"firebase.google.com/go/v4/auth"

	"github.com/fiap/cp4-chat/server/internal/domain"
)

// Error is an API error with a stable machine code (the app maps codes to
// UI states) and a pt-BR message that is safe to show to the user.
type Error struct {
	Status  int    `json:"-"`
	Code    string `json:"code"`
	Message string `json:"message"`
}

func (e *Error) Error() string { return e.Code }

func NewError(status int, code, message string) *Error {
	return &Error{Status: status, Code: code, Message: message}
}

var (
	ErrUnauthenticated = NewError(http.StatusUnauthorized, "UNAUTHENTICATED", "Sessão expirada. Entre novamente.")
	ErrForbidden       = NewError(http.StatusForbidden, "FORBIDDEN", "Você não tem permissão para esta ação.")
	ErrBadRequest      = NewError(http.StatusBadRequest, "BAD_REQUEST", "Requisição inválida.")
	ErrInternal        = NewError(http.StatusInternalServerError, "INTERNAL", "Erro interno. Tente novamente em instantes.")
)

func WriteJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

// WriteError renders known errors as-is; anything else is logged and
// reported as a generic 500 so internals never leak to the client.
func WriteError(w http.ResponseWriter, r *http.Request, err error) {
	var apiErr *Error
	var validation *domain.ValidationError
	switch {
	case errors.As(err, &apiErr):
	case errors.As(err, &validation):
		status := http.StatusBadRequest
		if validation.Code == "GROUP_FULL" || validation.Code == "MEMBER_LIMIT_BELOW_MEMBERS" {
			status = http.StatusConflict
		}
		apiErr = NewError(status, validation.Code, validation.Message)
	default:
		slog.ErrorContext(r.Context(), "request failed", "path", r.URL.Path, "error", err.Error())
		apiErr = ErrInternal
	}
	WriteJSON(w, apiErr.Status, map[string]*Error{"error": apiErr})
}

// HandlerFunc lets handlers return errors instead of writing them.
type HandlerFunc func(w http.ResponseWriter, r *http.Request) error

func Handle(fn HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := fn(w, r); err != nil {
			WriteError(w, r, err)
		}
	}
}

const maxBodyBytes = 16 << 10

// DecodeJSON reads a small JSON body, rejecting unknown fields.
func DecodeJSON(r *http.Request, dst any) error {
	dec := json.NewDecoder(http.MaxBytesReader(nil, r.Body, maxBodyBytes))
	dec.DisallowUnknownFields()
	if err := dec.Decode(dst); err != nil {
		return ErrBadRequest
	}
	return nil
}

type ctxKey struct{}

// UserID returns the uid verified by Authenticate.
func UserID(ctx context.Context) string {
	uid, _ := ctx.Value(ctxKey{}).(string)
	return uid
}

// Authenticate verifies the Firebase ID token in "Authorization: Bearer".
// Verification is local (signature + claims against Google's cached public
// keys), so it costs no network round-trip after the first request.
func Authenticate(client *auth.Client, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		header := r.Header.Get("Authorization")
		token, ok := strings.CutPrefix(header, "Bearer ")
		if !ok || token == "" {
			WriteError(w, r, ErrUnauthenticated)
			return
		}
		verified, err := client.VerifyIDToken(r.Context(), token)
		if err != nil {
			WriteError(w, r, ErrUnauthenticated)
			return
		}
		if verified.Firebase.SignInProvider != "password" {
			// Only e-mail/password accounts exist in this app.
			WriteError(w, r, ErrForbidden)
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), ctxKey{}, verified.UID)))
	})
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (s *statusRecorder) WriteHeader(code int) {
	s.status = code
	s.ResponseWriter.WriteHeader(code)
}

// Common wraps every request with panic recovery, CORS, a deadline and one
// structured log line (Cloud Logging parses the JSON on stdout).
func Common(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}

		// The mobile app is not a browser; CORS only matters for the web
		// build used in development. No cookies are involved, so "*" is safe.
		h := w.Header()
		h.Set("Access-Control-Allow-Origin", "*")
		h.Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
		h.Set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
		h.Set("X-Content-Type-Options", "nosniff")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), 25*time.Second)
		defer cancel()

		defer func() {
			if p := recover(); p != nil {
				slog.Error("panic", "path", r.URL.Path, "panic", p)
				WriteError(rec, r, ErrInternal)
			}
			slog.Info("request",
				"method", r.Method,
				"path", r.URL.Path,
				"status", rec.status,
				"latencyMs", time.Since(start).Milliseconds(),
			)
		}()
		next.ServeHTTP(rec, r.WithContext(ctx))
	})
}
