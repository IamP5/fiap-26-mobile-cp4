// Package api exposes the HTTP endpoints.
package api

import (
	"errors"
	"log/slog"
	"net/http"
	"slices"
	"strings"
	"time"

	"github.com/fiap/cp4-chat/server/internal/domain"
	"github.com/fiap/cp4-chat/server/internal/httpx"
	"github.com/fiap/cp4-chat/server/internal/notify"
	"github.com/fiap/cp4-chat/server/internal/platform"
	"github.com/fiap/cp4-chat/server/internal/store"
)

type Server struct {
	cfg     platform.Config
	clients *platform.Clients
	store   *store.Store
	started time.Time
}

func NewServer(cfg platform.Config, clients *platform.Clients) *Server {
	return &Server{
		cfg:     cfg,
		clients: clients,
		store:   store.New(clients.Firestore, clients.DB),
		started: time.Now(),
	}
}

func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()
	authed := func(fn httpx.HandlerFunc) http.Handler {
		return httpx.Authenticate(s.clients.Auth, httpx.Handle(fn))
	}

	// Not /healthz: Cloud Run reserves paths ending in "z" at its front end.
	mux.HandleFunc("GET /{$}", s.health)
	mux.HandleFunc("GET /health", s.health)
	mux.Handle("POST /notifications/messages", authed(s.notifyMessage))
	mux.Handle("POST /groups", authed(s.createGroup))
	mux.Handle("PATCH /groups/{groupId}", authed(s.updateGroup))
	mux.Handle("DELETE /groups/{groupId}", authed(s.deleteGroup))
	mux.Handle("POST /groups/{groupId}/members", authed(s.addMembers))
	mux.Handle("DELETE /groups/{groupId}/members/{memberId}", authed(s.removeMember))
	mux.Handle("POST /groups/{groupId}/sync", authed(s.syncGroup))
	mux.Handle("GET /profiles/{uid}", authed(s.getProfile))
	return httpx.Common(mux)
}

// health is public and touches no backend, so uptime checks never wake the
// databases (and cost nothing beyond the instance itself).
func (s *Server) health(w http.ResponseWriter, _ *http.Request) {
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"status":        "ok",
		"service":       "cp4-chat-api",
		"version":       s.cfg.Version,
		"uptimeSeconds": int(time.Since(s.started).Seconds()),
	})
}

// ---- POST /notifications/messages ------------------------------------------

type notifyRequest struct {
	ConversationID string `json:"conversationId"`
	MessageID      string `json:"messageId"`
}

type notifyResponse struct {
	Status        string                    `json:"status"`
	Policy        domain.NotificationPolicy `json:"policy,omitempty"`
	Recipients    int                       `json:"recipients"`
	Devices       int                       `json:"devices"`
	Delivered     int                       `json:"delivered"`
	Failed        int                       `json:"failed"`
	RemovedTokens int                       `json:"removedTokens"`
}

// A push for a message older than this is refused: the endpoint exists to
// announce new messages, not to replay history.
const maxMessageAge = 15 * time.Minute

func (s *Server) notifyMessage(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	uid := httpx.UserID(ctx)

	var req notifyRequest
	if err := httpx.DecodeJSON(r, &req); err != nil {
		return err
	}
	if !domain.ValidConversationID(req.ConversationID) || !domain.ValidMessageID(req.MessageID) {
		return httpx.NewError(http.StatusBadRequest, "INVALID_IDS", "Conversa ou mensagem inválida.")
	}

	// 1. The message must exist in the Realtime Database and belong to the caller.
	msg, err := s.store.GetMessage(ctx, req.ConversationID, req.MessageID)
	if errors.Is(err, store.ErrNotFound) {
		return httpx.NewError(http.StatusNotFound, "MESSAGE_NOT_FOUND", "Mensagem não encontrada.")
	}
	if err != nil {
		return err
	}
	if msg.SenderID != uid {
		return httpx.NewError(http.StatusForbidden, "NOT_MESSAGE_SENDER", "Só o autor pode notificar esta mensagem.")
	}
	if age := time.Since(time.UnixMilli(msg.CreatedAt)); age > maxMessageAge {
		return httpx.NewError(http.StatusConflict, "MESSAGE_TOO_OLD", "Mensagem antiga demais para notificar.")
	}

	// 2. Participants and policy come from Firestore, never from the request.
	input := notify.ResolveInput{
		SenderID:  uid,
		Target:    msg.Target,
		Mentioned: msg.Mentions(),
	}
	content := notify.Content{ConversationID: req.ConversationID, MessageID: req.MessageID}

	if domain.IsDirectConversationID(req.ConversationID) {
		if msg.ConversationType != domain.ConversationDirect {
			return httpx.NewError(http.StatusBadRequest, "TYPE_MISMATCH", "Tipo de conversa inválido.")
		}
		participants, err := s.store.DirectConversationParticipants(ctx, req.ConversationID)
		if errors.Is(err, store.ErrNotFound) {
			return httpx.NewError(http.StatusNotFound, "CONVERSATION_NOT_FOUND", "Conversa não encontrada.")
		}
		if err != nil {
			return err
		}
		if !slices.Contains(participants, uid) {
			return httpx.ErrForbidden
		}
		input.ConversationType = domain.ConversationDirect
		input.Participants = participants
		content.ConversationType = domain.ConversationDirect
	} else {
		if msg.ConversationType != domain.ConversationGroup {
			return httpx.NewError(http.StatusBadRequest, "TYPE_MISMATCH", "Tipo de conversa inválido.")
		}
		group, err := s.store.GetGroup(ctx, req.ConversationID)
		if errors.Is(err, store.ErrNotFound) {
			return httpx.NewError(http.StatusNotFound, "GROUP_NOT_FOUND", "Grupo não encontrado.")
		}
		if err != nil {
			return err
		}
		// Self-heal the RTDB membership mirror if a previous sync failed.
		if ok, err := s.store.MirrorMatches(ctx, group.ID, group.MemberIDs); err == nil && !ok {
			if err := s.store.SyncGroupMirror(ctx, group.ID, group.MemberIDs); err != nil {
				slog.WarnContext(ctx, "mirror heal failed", "group", group.ID, "error", err.Error())
			}
		}
		if !group.HasMember(uid) {
			return httpx.NewError(http.StatusForbidden, "NOT_A_MEMBER", "Você não faz mais parte deste grupo.")
		}
		input.ConversationType = domain.ConversationGroup
		input.Participants = group.MemberIDs
		input.Policy = group.NotificationPolicy
		content.ConversationType = domain.ConversationGroup
		content.GroupName = group.Name
	}

	// 3. Idempotency: only the first request for a message sends anything.
	claim, err := s.store.ClaimDispatch(ctx, req.ConversationID, req.MessageID, uid)
	if err != nil {
		return err
	}
	if claim != store.Claimed {
		httpx.WriteJSON(w, http.StatusOK, notifyResponse{Status: "duplicate", Policy: input.Policy})
		return nil
	}

	recipients := notify.ResolveRecipients(input)
	resp := notifyResponse{Status: "sent", Policy: input.Policy, Recipients: len(recipients)}
	if len(recipients) == 0 {
		resp.Status = "no_recipients"
		_ = s.store.CompleteDispatch(ctx, req.ConversationID, req.MessageID, map[string]any{"recipients": 0})
		httpx.WriteJSON(w, http.StatusOK, resp)
		return nil
	}

	uids := make([]string, len(recipients))
	for i, rcp := range recipients {
		uids[i] = rcp.UID
	}
	devices, err := s.store.EnabledDevices(ctx, uids)
	if err != nil {
		s.store.ReleaseDispatch(ctx, req.ConversationID, req.MessageID)
		return err
	}
	resp.Devices = len(devices)
	content.SenderName = s.store.PublicName(ctx, uid)

	result, err := notify.Send(ctx, s.clients.Messaging, s.store, content, recipients, devices)
	if err != nil {
		s.store.ReleaseDispatch(ctx, req.ConversationID, req.MessageID)
		slog.ErrorContext(ctx, "fcm send failed", "error", err.Error())
		return httpx.NewError(http.StatusBadGateway, "PUSH_FAILED", "Não foi possível enviar a notificação.")
	}
	resp.Delivered, resp.Failed, resp.RemovedTokens = result.Delivered, result.Failed, result.RemovedTokens
	if len(devices) == 0 {
		resp.Status = "no_devices"
	}
	_ = s.store.CompleteDispatch(ctx, req.ConversationID, req.MessageID, map[string]any{
		"recipients": resp.Recipients, "devices": resp.Devices,
		"delivered": resp.Delivered, "failed": resp.Failed, "removedTokens": resp.RemovedTokens,
	})
	httpx.WriteJSON(w, http.StatusOK, resp)
	return nil
}

// ---- GET /profiles/{uid} ----------------------------------------------------

// getProfile returns registration data only to users who share a direct
// conversation or a group with the profile's owner.
func (s *Server) getProfile(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	viewer := httpx.UserID(ctx)
	target := r.PathValue("uid")
	if !domain.ValidUID(target) {
		return httpx.ErrBadRequest
	}
	if target != viewer {
		allowed := false
		participants, err := s.store.DirectConversationParticipants(ctx, domain.DirectConversationID(viewer, target))
		switch {
		case err == nil:
			allowed = slices.Contains(participants, viewer) && slices.Contains(participants, target)
		case !errors.Is(err, store.ErrNotFound):
			return err
		}
		if !allowed {
			if allowed, err = s.store.SharesGroup(ctx, viewer, target); err != nil {
				return err
			}
		}
		if !allowed {
			return httpx.NewError(http.StatusForbidden, "PROFILE_NOT_SHARED",
				"Você só pode ver o perfil de quem tem uma conversa ou grupo em comum com você.")
		}
	}
	profile, err := s.store.GetProfile(ctx, target)
	if errors.Is(err, store.ErrNotFound) {
		return httpx.NewError(http.StatusNotFound, "PROFILE_NOT_FOUND", "Perfil não encontrado.")
	}
	if err != nil {
		return err
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]store.Profile{"profile": profile})
	return nil
}

func isHTTPS(url string) bool { return strings.HasPrefix(url, "https://") }
