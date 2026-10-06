package notify

import (
	"context"
	"strings"

	"cloud.google.com/go/firestore"
	"firebase.google.com/go/v4/messaging"

	"github.com/fiap/cp4-chat/server/internal/domain"
	"github.com/fiap/cp4-chat/server/internal/store"
)

// fcmBatchLimit is the maximum number of tokens per FCM multicast.
const fcmBatchLimit = 500

type Content struct {
	ConversationID   string
	ConversationType domain.ConversationType
	MessageID        string
	SenderName       string
	GroupName        string
}

type Result struct {
	Delivered     int
	Failed        int
	RemovedTokens int
}

// Copy deliberately excludes the message text: lock screens are public, so
// the notification only says who wrote and where.
func title(c Content) string {
	if c.ConversationType == domain.ConversationGroup && c.GroupName != "" {
		return c.GroupName
	}
	if c.SenderName != "" {
		return c.SenderName
	}
	return "Nova mensagem"
}

func body(c Content, reason Reason) string {
	sender := c.SenderName
	if sender == "" {
		sender = "Alguém"
	}
	switch reason {
	case ReasonMention:
		return sender + " mencionou você"
	case ReasonTargeted:
		return sender + " enviou uma mensagem para você"
	case ReasonGroup:
		return sender + " enviou uma mensagem"
	default:
		return "Enviou uma nova mensagem"
	}
}

// Send delivers one notification per device of each recipient, grouping
// devices by notification copy so every copy goes out as few multicasts as
// possible. Tokens that FCM reports as unregistered or malformed are deleted.
// On error the returned Result still counts what was already delivered, so
// the caller can tell a total failure (safe to retry) from a partial one.
func Send(ctx context.Context, client *messaging.Client, st *store.Store, c Content, recipients []Recipient, devices []store.Device) (Result, error) {
	reasonByUID := make(map[string]Reason, len(recipients))
	for _, r := range recipients {
		reasonByUID[r.UID] = r.Reason
	}
	byReason := map[Reason][]store.Device{}
	for _, d := range devices {
		reason := reasonByUID[d.UID]
		byReason[reason] = append(byReason[reason], d)
	}

	var res Result
	var stale []*firestore.DocumentRef
	for reason, group := range byReason {
		for start := 0; start < len(group); start += fcmBatchLimit {
			batch := group[start:min(start+fcmBatchLimit, len(group))]
			tokens := make([]string, len(batch))
			for i, d := range batch {
				tokens[i] = d.Token
			}
			resp, err := client.SendEachForMulticast(ctx, buildMessage(c, reason, tokens))
			if err != nil {
				if derr := st.DeleteDevices(ctx, stale); derr == nil {
					res.RemovedTokens = len(stale)
				}
				return res, err
			}
			for i, r := range resp.Responses {
				if r.Success {
					res.Delivered++
					continue
				}
				res.Failed++
				if isDeadToken(r.Error) {
					stale = append(stale, batch[i].Ref)
				}
			}
		}
	}
	if err := st.DeleteDevices(ctx, stale); err == nil {
		res.RemovedTokens = len(stale)
	}
	return res, nil
}

// isDeadToken: unregistered tokens (app uninstalled, token rotated), tokens
// from another Firebase project, and malformed tokens. INVALID_ARGUMENT is
// only trusted when FCM blames the token itself, so a payload bug can never
// wipe every device.
func isDeadToken(err error) bool {
	if err == nil {
		return false
	}
	if messaging.IsUnregistered(err) || messaging.IsSenderIDMismatch(err) {
		return true
	}
	return messaging.IsInvalidArgument(err) && strings.Contains(strings.ToLower(err.Error()), "registration token")
}

func buildMessage(c Content, reason Reason, tokens []string) *messaging.MulticastMessage {
	return &messaging.MulticastMessage{
		Tokens: tokens,
		Notification: &messaging.Notification{
			Title: title(c),
			Body:  body(c, reason),
		},
		// The app reads these on tap to open the right conversation.
		Data: map[string]string{
			"conversationId":   c.ConversationID,
			"conversationType": string(c.ConversationType),
			"messageId":        c.MessageID,
		},
		Android: &messaging.AndroidConfig{
			Priority: "high",
			Notification: &messaging.AndroidNotification{
				// Same tag = one tray entry per conversation, replaced by newer messages.
				Tag:   c.ConversationID,
				Sound: "default",
			},
		},
		APNS: &messaging.APNSConfig{
			Headers: map[string]string{"apns-priority": "10"},
			Payload: &messaging.APNSPayload{
				Aps: &messaging.Aps{
					Sound:    "default",
					ThreadID: c.ConversationID,
				},
			},
		},
	}
}
