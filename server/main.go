// Command server is the CP4 Chat API: push notifications, group management
// and shared-profile access, backed by the Firebase Admin SDK. Designed for
// Cloud Run with min-instances=0 and request-based CPU: one static binary in
// a distroless image (~11 MB compressed), serving a few milliseconds after the
// container starts, with no runtime or JIT to warm up.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/fiap/cp4-chat/server/internal/api"
	"github.com/fiap/cp4-chat/server/internal/platform"
)

func main() {
	// Cloud Logging reads "severity" and "message" from JSON lines on stdout.
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		ReplaceAttr: func(_ []string, a slog.Attr) slog.Attr {
			switch a.Key {
			case slog.LevelKey:
				a.Key = "severity"
			case slog.MessageKey:
				a.Key = "message"
			}
			return a
		},
	})))

	cfg, err := platform.LoadConfig()
	if err != nil {
		slog.Error("invalid configuration", "error", err.Error())
		os.Exit(1)
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	clients, err := platform.NewClients(ctx, cfg)
	if err != nil {
		slog.Error("firebase init failed", "error", err.Error())
		os.Exit(1)
	}
	defer clients.Firestore.Close()

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           api.NewServer(cfg, clients).Routes(),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	go func() {
		slog.Info("listening", "port", cfg.Port, "project", cfg.ProjectID)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			slog.Error("server failed", "error", err.Error())
			os.Exit(1)
		}
	}()

	// Cloud Run sends SIGTERM and allows 10s before SIGKILL.
	<-ctx.Done()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	_ = srv.Shutdown(shutdownCtx)
}
