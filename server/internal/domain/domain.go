// Package domain holds the pure (I/O free) rules of the chat backend: ids,
// group invariants and the shapes stored in Firestore and the Realtime
// Database. Everything here is unit tested without Firebase.
package domain

import (
	"regexp"
	"slices"
	"sort"
	"strings"
	"unicode/utf8"
)

type ConversationType string

const (
	ConversationDirect ConversationType = "direct"
	ConversationGroup  ConversationType = "group"
)

type NotificationPolicy string

const (
	PolicyAllGroupMessages   NotificationPolicy = "all_group_messages"
	PolicyMentionedMembers   NotificationPolicy = "mentioned_members"
	PolicyDirectMessagesOnly NotificationPolicy = "direct_messages_only"
	PolicyDisabled           NotificationPolicy = "disabled"
)

func (p NotificationPolicy) Valid() bool {
	switch p {
	case PolicyAllGroupMessages, PolicyMentionedMembers, PolicyDirectMessagesOnly, PolicyDisabled:
		return true
	}
	return false
}

// Group limits. MaxMemberLimit keeps a single FCM multicast (500 tokens) and
// the RTDB membership mirror comfortably small.
const (
	MinGroupMembers    = 2
	MaxMemberLimit     = 50
	MaxGroupNameLength = 60
)

// Group mirrors groups/{groupId} in Firestore. Timestamps are epoch millis so
// the app can use plain numbers, as in the assignment's TypeScript types.
type Group struct {
	ID                          string             `firestore:"-" json:"id"`
	Name                        string             `firestore:"name" json:"name"`
	PhotoURL                    string             `firestore:"photoUrl" json:"photoUrl"`
	OwnerID                     string             `firestore:"ownerId" json:"ownerId"`
	MemberIDs                   []string           `firestore:"memberIds" json:"memberIds"`
	MemberLimit                 int64              `firestore:"memberLimit" json:"memberLimit"`
	NotificationPolicy          NotificationPolicy `firestore:"notificationPolicy" json:"notificationPolicy"`
	NotificationPolicyUpdatedBy string             `firestore:"notificationPolicyUpdatedBy" json:"notificationPolicyUpdatedBy"`
	NotificationPolicyUpdatedAt int64              `firestore:"notificationPolicyUpdatedAt" json:"notificationPolicyUpdatedAt"`
	CreatedAt                   int64              `firestore:"createdAt" json:"createdAt"`
	UpdatedAt                   int64              `firestore:"updatedAt" json:"updatedAt"`
}

func (g Group) HasMember(uid string) bool { return slices.Contains(g.MemberIDs, uid) }

// MessageTarget mirrors the app's MessageTarget union.
type MessageTarget struct {
	Type     string `json:"type"`
	MemberID string `json:"memberId,omitempty"`
}

// Message mirrors messages/{conversationId}/{messageId} in the Realtime
// Database. RTDB cannot store empty arrays, so mentions are a {uid: true} map.
type Message struct {
	ConversationType ConversationType `json:"conversationType"`
	SenderID         string           `json:"senderId"`
	Text             string           `json:"text"`
	Target           MessageTarget    `json:"target"`
	MentionedUserIDs map[string]bool  `json:"mentionedUserIds"`
	CreatedAt        int64            `json:"createdAt"`
}

func (m Message) Mentions() []string {
	out := make([]string, 0, len(m.MentionedUserIDs))
	for uid, on := range m.MentionedUserIDs {
		if on {
			out = append(out, uid)
		}
	}
	sort.Strings(out)
	return out
}

var (
	uidPattern            = regexp.MustCompile(`^[A-Za-z0-9]{1,128}$`)
	groupIDPattern        = regexp.MustCompile(`^[A-Za-z0-9]{1,128}$`)
	messageIDPattern      = regexp.MustCompile(`^[A-Za-z0-9_-]{1,64}$`)
	conversationIDPattern = regexp.MustCompile(`^[A-Za-z0-9]{1,128}(_[A-Za-z0-9]{1,128})?$`)
)

func ValidUID(uid string) bool           { return uidPattern.MatchString(uid) }
func ValidGroupID(id string) bool        { return groupIDPattern.MatchString(id) }
func ValidMessageID(id string) bool      { return messageIDPattern.MatchString(id) }
func ValidConversationID(id string) bool { return conversationIDPattern.MatchString(id) }
func DirectConversationID(uidA, uidB string) string {
	if uidA < uidB {
		return uidA + "_" + uidB
	}
	return uidB + "_" + uidA
}

// DirectParticipants splits a direct conversation id ("uidA_uidB", sorted).
// Group ids never contain '_' (Firestore auto ids are alphanumeric), so the
// two id spaces cannot collide.
func DirectParticipants(conversationID string) (string, string, bool) {
	parts := strings.Split(conversationID, "_")
	if len(parts) != 2 || !ValidUID(parts[0]) || !ValidUID(parts[1]) || parts[0] >= parts[1] {
		return "", "", false
	}
	return parts[0], parts[1], true
}

func IsDirectConversationID(conversationID string) bool {
	_, _, ok := DirectParticipants(conversationID)
	return ok
}

// ValidationError is a rule violation that the API reports as 4xx with a
// stable machine code plus a pt-BR message.
type ValidationError struct {
	Code    string
	Message string
}

func (e *ValidationError) Error() string { return e.Code + ": " + e.Message }

func invalid(code, message string) *ValidationError {
	return &ValidationError{Code: code, Message: message}
}

func NormalizeGroupName(name string) (string, error) {
	trimmed := strings.Join(strings.Fields(name), " ")
	if trimmed == "" {
		return "", invalid("INVALID_GROUP_NAME", "Informe o nome do grupo.")
	}
	if utf8.RuneCountInString(trimmed) > MaxGroupNameLength {
		return "", invalid("INVALID_GROUP_NAME", "O nome do grupo deve ter no máximo 60 caracteres.")
	}
	return trimmed, nil
}

// ValidateMemberLimit checks a limit against the current member count; the
// owner counts as a member.
func ValidateMemberLimit(limit int64, currentMembers int) error {
	if limit < MinGroupMembers || limit > MaxMemberLimit {
		return invalid("INVALID_MEMBER_LIMIT", "O limite deve ser um número inteiro entre 2 e 50.")
	}
	if limit < int64(currentMembers) {
		return invalid("MEMBER_LIMIT_BELOW_MEMBERS",
			"O limite não pode ser menor que a quantidade atual de integrantes.")
	}
	return nil
}

// UniqueMembers returns the owner followed by the other distinct members,
// preserving the caller's order.
func UniqueMembers(ownerID string, memberIDs []string) []string {
	seen := map[string]bool{ownerID: true}
	out := []string{ownerID}
	for _, id := range memberIDs {
		if !seen[id] {
			seen[id] = true
			out = append(out, id)
		}
	}
	return out
}

func ValidateMemberIDs(ids []string) error {
	for _, id := range ids {
		if !ValidUID(id) {
			return invalid("INVALID_MEMBER", "Um dos integrantes informados é inválido.")
		}
	}
	return nil
}

// PlanCreate validates a new group's membership against its limit.
func PlanCreate(ownerID string, memberIDs []string, limit int64) ([]string, error) {
	if err := ValidateMemberIDs(memberIDs); err != nil {
		return nil, err
	}
	members := UniqueMembers(ownerID, memberIDs)
	if len(members) < MinGroupMembers {
		return nil, invalid("NOT_ENOUGH_MEMBERS", "Selecione pelo menos um integrante além de você.")
	}
	if err := ValidateMemberLimit(limit, 0); err != nil {
		return nil, err
	}
	if int64(len(members)) > limit {
		return nil, invalid("GROUP_FULL", "A quantidade de integrantes ultrapassa o limite definido.")
	}
	return members, nil
}

// PlanAddMembers merges new members into a group, refusing anything that
// would overflow the limit. It runs inside a Firestore transaction, so the
// check and the write see the same snapshot even under concurrent requests.
func PlanAddMembers(current []string, add []string, limit int64) (merged []string, added []string, err error) {
	if err := ValidateMemberIDs(add); err != nil {
		return nil, nil, err
	}
	seen := make(map[string]bool, len(current))
	merged = append(merged, current...)
	for _, id := range current {
		seen[id] = true
	}
	for _, id := range add {
		if !seen[id] {
			seen[id] = true
			merged = append(merged, id)
			added = append(added, id)
		}
	}
	if len(added) == 0 {
		return nil, nil, invalid("NOTHING_TO_ADD", "Os usuários selecionados já fazem parte do grupo.")
	}
	if int64(len(merged)) > limit {
		free := max(limit-int64(len(current)), 0)
		return nil, nil, invalid("GROUP_FULL", groupFullMessage(free))
	}
	return merged, added, nil
}

func groupFullMessage(free int64) string {
	switch free {
	case 0:
		return "O grupo atingiu o limite de integrantes."
	case 1:
		return "Só resta 1 vaga no grupo."
	default:
		return "Não há vagas suficientes no grupo para todos os selecionados."
	}
}

func PlanRemoveMember(g Group, memberID string) ([]string, error) {
	if memberID == g.OwnerID {
		return nil, invalid("CANNOT_REMOVE_OWNER", "O proprietário não pode ser removido do grupo.")
	}
	if !g.HasMember(memberID) {
		return nil, invalid("NOT_A_MEMBER", "Este usuário não faz parte do grupo.")
	}
	if len(g.MemberIDs)-1 < MinGroupMembers {
		return nil, invalid("NOT_ENOUGH_MEMBERS",
			"Um grupo precisa de pelo menos 2 integrantes. Exclua o grupo em vez de remover o último integrante.")
	}
	out := make([]string, 0, len(g.MemberIDs)-1)
	for _, id := range g.MemberIDs {
		if id != memberID {
			out = append(out, id)
		}
	}
	return out, nil
}
