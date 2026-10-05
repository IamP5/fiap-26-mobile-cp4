// Package notify decides who receives a push for a message and delivers it
// through Firebase Cloud Messaging.
package notify

import (
	"sort"

	"github.com/fiap/cp4-chat/server/internal/domain"
)

// Reason shapes the notification copy for a recipient.
type Reason string

const (
	ReasonDirect   Reason = "direct"   // message in a 1:1 conversation
	ReasonGroup    Reason = "group"    // general group message
	ReasonMention  Reason = "mention"  // recipient was @mentioned
	ReasonTargeted Reason = "targeted" // message explicitly addressed to the recipient
)

type Recipient struct {
	UID    string
	Reason Reason
}

// ResolveInput carries only server-side facts: participants and policy come
// from Firestore, target and mentions from the persisted RTDB message. The
// app never sends a recipient list.
type ResolveInput struct {
	ConversationType domain.ConversationType
	SenderID         string
	Participants     []string
	Policy           domain.NotificationPolicy
	Target           domain.MessageTarget
	Mentioned        []string
}

// ResolveRecipients applies the conversation's notification policy. The
// sender is always excluded, and only current participants can be returned
// (targets and mentions of non-members are ignored).
func ResolveRecipients(in ResolveInput) []Recipient {
	participants := make(map[string]bool, len(in.Participants))
	for _, uid := range in.Participants {
		participants[uid] = true
	}
	eligible := func(uid string) bool { return uid != "" && uid != in.SenderID && participants[uid] }

	if in.ConversationType == domain.ConversationDirect {
		var out []Recipient
		for _, uid := range in.Participants {
			if eligible(uid) {
				out = append(out, Recipient{UID: uid, Reason: ReasonDirect})
			}
		}
		return sorted(out)
	}

	addressed := map[string]Reason{}
	for _, uid := range in.Mentioned {
		if eligible(uid) {
			addressed[uid] = ReasonMention
		}
	}
	if in.Target.Type == "member" && eligible(in.Target.MemberID) {
		addressed[in.Target.MemberID] = ReasonTargeted
	}

	var out []Recipient
	switch in.Policy {
	case domain.PolicyAllGroupMessages:
		for _, uid := range in.Participants {
			if !eligible(uid) {
				continue
			}
			reason, ok := addressed[uid]
			if !ok {
				reason = ReasonGroup
			}
			out = append(out, Recipient{UID: uid, Reason: reason})
		}
	case domain.PolicyMentionedMembers:
		for uid, reason := range addressed {
			out = append(out, Recipient{UID: uid, Reason: reason})
		}
	case domain.PolicyDirectMessagesOnly, domain.PolicyDisabled:
		// group messages never push under these policies
	}
	return sorted(dedupe(out))
}

func dedupe(in []Recipient) []Recipient {
	seen := make(map[string]bool, len(in))
	out := in[:0]
	for _, r := range in {
		if !seen[r.UID] {
			seen[r.UID] = true
			out = append(out, r)
		}
	}
	return out
}

func sorted(in []Recipient) []Recipient {
	sort.Slice(in, func(i, j int) bool { return in[i].UID < in[j].UID })
	return in
}
