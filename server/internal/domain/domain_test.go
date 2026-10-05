package domain

import (
	"errors"
	"reflect"
	"testing"
)

func code(err error) string {
	var v *ValidationError
	if errors.As(err, &v) {
		return v.Code
	}
	return ""
}

func TestDirectConversationIDs(t *testing.T) {
	if got := DirectConversationID("zed", "amy"); got != "amy_zed" {
		t.Fatalf("got %q", got)
	}
	if a, b, ok := DirectParticipants("amy_zed"); !ok || a != "amy" || b != "zed" {
		t.Fatalf("parse failed: %q %q %v", a, b, ok)
	}
	for _, bad := range []string{"zed_amy", "amy_amy", "amy", "a_b_c", "amy_", "Gx8kQ2aZ"} {
		if IsDirectConversationID(bad) {
			t.Fatalf("%q must not be a direct id", bad)
		}
	}
}

func TestPlanCreate(t *testing.T) {
	members, err := PlanCreate("owner", []string{"a", "b", "a", "owner"}, 3)
	if err != nil || !reflect.DeepEqual(members, []string{"owner", "a", "b"}) {
		t.Fatalf("got %v %v", members, err)
	}
	if _, err := PlanCreate("owner", []string{"a", "b", "c"}, 3); code(err) != "GROUP_FULL" {
		t.Fatalf("limit counts the owner: %v", err)
	}
	if _, err := PlanCreate("owner", nil, 5); code(err) != "NOT_ENOUGH_MEMBERS" {
		t.Fatalf("got %v", err)
	}
	if _, err := PlanCreate("owner", []string{"a"}, 1); code(err) != "INVALID_MEMBER_LIMIT" {
		t.Fatalf("got %v", err)
	}
	if _, err := PlanCreate("owner", []string{"a/../b"}, 5); code(err) != "INVALID_MEMBER" {
		t.Fatalf("got %v", err)
	}
}

func TestPlanAddMembers(t *testing.T) {
	merged, added, err := PlanAddMembers([]string{"o", "a"}, []string{"a", "b"}, 3)
	if err != nil || !reflect.DeepEqual(merged, []string{"o", "a", "b"}) || !reflect.DeepEqual(added, []string{"b"}) {
		t.Fatalf("got %v %v %v", merged, added, err)
	}
	if _, _, err := PlanAddMembers([]string{"o", "a", "b"}, []string{"c"}, 3); code(err) != "GROUP_FULL" {
		t.Fatalf("full group must refuse: %v", err)
	}
	if _, _, err := PlanAddMembers([]string{"o", "a"}, []string{"a"}, 3); code(err) != "NOTHING_TO_ADD" {
		t.Fatalf("got %v", err)
	}
}

func TestValidateMemberLimit(t *testing.T) {
	if err := ValidateMemberLimit(4, 5); code(err) != "MEMBER_LIMIT_BELOW_MEMBERS" {
		t.Fatalf("got %v", err)
	}
	if err := ValidateMemberLimit(5, 5); err != nil {
		t.Fatalf("got %v", err)
	}
	if err := ValidateMemberLimit(MaxMemberLimit+1, 2); code(err) != "INVALID_MEMBER_LIMIT" {
		t.Fatalf("got %v", err)
	}
}

func TestPlanRemoveMember(t *testing.T) {
	g := Group{OwnerID: "o", MemberIDs: []string{"o", "a", "b"}}
	if got, err := PlanRemoveMember(g, "a"); err != nil || !reflect.DeepEqual(got, []string{"o", "b"}) {
		t.Fatalf("got %v %v", got, err)
	}
	if _, err := PlanRemoveMember(g, "o"); code(err) != "CANNOT_REMOVE_OWNER" {
		t.Fatalf("got %v", err)
	}
	if _, err := PlanRemoveMember(Group{OwnerID: "o", MemberIDs: []string{"o", "a"}}, "a"); code(err) != "NOT_ENOUGH_MEMBERS" {
		t.Fatalf("got %v", err)
	}
}

func TestNormalizeGroupName(t *testing.T) {
	if got, err := NormalizeGroupName("  Turma   da  FIAP "); err != nil || got != "Turma da FIAP" {
		t.Fatalf("got %q %v", got, err)
	}
	if _, err := NormalizeGroupName("   "); code(err) != "INVALID_GROUP_NAME" {
		t.Fatalf("got %v", err)
	}
}
