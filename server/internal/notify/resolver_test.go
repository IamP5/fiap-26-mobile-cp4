package notify

import (
	"reflect"
	"testing"

	"github.com/fiap/cp4-chat/server/internal/domain"
)

func uids(rs []Recipient) []string {
	out := []string{}
	for _, r := range rs {
		out = append(out, r.UID)
	}
	return out
}

func TestResolveRecipients(t *testing.T) {
	members := []string{"alice", "bob", "carol", "dave"}
	general := domain.MessageTarget{Type: "conversation"}
	toCarol := domain.MessageTarget{Type: "member", MemberID: "carol"}

	cases := []struct {
		name string
		in   ResolveInput
		want []string
	}{
		{
			name: "direct notifies the other participant only",
			in:   ResolveInput{ConversationType: domain.ConversationDirect, SenderID: "alice", Participants: []string{"alice", "bob"}, Target: general},
			want: []string{"bob"},
		},
		{
			name: "direct ignores group policies",
			in:   ResolveInput{ConversationType: domain.ConversationDirect, SenderID: "bob", Participants: []string{"alice", "bob"}, Policy: domain.PolicyDisabled, Target: general},
			want: []string{"alice"},
		},
		{
			name: "all_group_messages notifies everyone but the sender",
			in:   ResolveInput{ConversationType: domain.ConversationGroup, SenderID: "alice", Participants: members, Policy: domain.PolicyAllGroupMessages, Target: general},
			want: []string{"bob", "carol", "dave"},
		},
		{
			name: "mentioned_members with a general message notifies nobody",
			in:   ResolveInput{ConversationType: domain.ConversationGroup, SenderID: "alice", Participants: members, Policy: domain.PolicyMentionedMembers, Target: general},
			want: []string{},
		},
		{
			name: "mentioned_members notifies mentions and the target",
			in:   ResolveInput{ConversationType: domain.ConversationGroup, SenderID: "alice", Participants: members, Policy: domain.PolicyMentionedMembers, Target: toCarol, Mentioned: []string{"bob"}},
			want: []string{"bob", "carol"},
		},
		{
			name: "mentions of non-members and of the sender are ignored",
			in:   ResolveInput{ConversationType: domain.ConversationGroup, SenderID: "alice", Participants: members, Policy: domain.PolicyMentionedMembers, Target: general, Mentioned: []string{"alice", "mallory"}},
			want: []string{},
		},
		{
			name: "direct_messages_only silences groups",
			in:   ResolveInput{ConversationType: domain.ConversationGroup, SenderID: "alice", Participants: members, Policy: domain.PolicyDirectMessagesOnly, Target: toCarol, Mentioned: []string{"bob"}},
			want: []string{},
		},
		{
			name: "disabled silences groups",
			in:   ResolveInput{ConversationType: domain.ConversationGroup, SenderID: "alice", Participants: members, Policy: domain.PolicyDisabled, Target: general},
			want: []string{},
		},
		{
			name: "a removed member is never notified, even when targeted",
			in:   ResolveInput{ConversationType: domain.ConversationGroup, SenderID: "alice", Participants: []string{"alice", "bob"}, Policy: domain.PolicyMentionedMembers, Target: toCarol},
			want: []string{},
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := uids(ResolveRecipients(tc.in))
			if !reflect.DeepEqual(got, tc.want) {
				t.Fatalf("got %v, want %v", got, tc.want)
			}
		})
	}
}

func TestResolveReasons(t *testing.T) {
	got := ResolveRecipients(ResolveInput{
		ConversationType: domain.ConversationGroup,
		SenderID:         "alice",
		Participants:     []string{"alice", "bob", "carol", "dave"},
		Policy:           domain.PolicyAllGroupMessages,
		Target:           domain.MessageTarget{Type: "member", MemberID: "carol"},
		Mentioned:        []string{"bob"},
	})
	want := []Recipient{{"bob", ReasonMention}, {"carol", ReasonTargeted}, {"dave", ReasonGroup}}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %v, want %v", got, want)
	}
}

func TestNotificationCopyHidesText(t *testing.T) {
	c := Content{ConversationType: domain.ConversationGroup, GroupName: "Família", SenderName: "Ana"}
	if title(c) != "Família" || body(c, ReasonMention) != "Ana mencionou você" {
		t.Fatalf("unexpected copy: %q / %q", title(c), body(c, ReasonMention))
	}
	d := Content{ConversationType: domain.ConversationDirect, SenderName: "Ana"}
	if title(d) != "Ana" || body(d, ReasonDirect) != "Enviou uma nova mensagem" {
		t.Fatalf("unexpected copy: %q / %q", title(d), body(d, ReasonDirect))
	}
}
