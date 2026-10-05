// Package store is the API's data access layer over Firestore (profiles,
// groups, devices, dispatch log) and the Realtime Database (messages and the
// group membership mirror used by the RTDB security rules).
package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"cloud.google.com/go/firestore"
	"firebase.google.com/go/v4/db"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"github.com/fiap/cp4-chat/server/internal/domain"
)

var ErrNotFound = errors.New("not found")

type Store struct {
	fs *firestore.Client
	db *db.Client
}

func New(fs *firestore.Client, database *db.Client) *Store {
	return &Store{fs: fs, db: database}
}

func notFound(err error) bool { return status.Code(err) == codes.NotFound }

func nowMillis() int64 { return time.Now().UnixMilli() }

// ---- profiles -------------------------------------------------------------

// Profile mirrors users/{uid}: the private registration data. Clients can
// only read their own document; others get it through GET /profiles/{uid},
// which checks for a shared conversation first.
type Profile struct {
	UID         string `firestore:"-" json:"uid"`
	Name        string `firestore:"name" json:"name"`
	Email       string `firestore:"email" json:"email"`
	PhoneNumber string `firestore:"phoneNumber" json:"phoneNumber"`
	BirthDate   string `firestore:"birthDate" json:"birthDate"`
	PhotoURL    string `firestore:"photoUrl" json:"photoUrl"`
	CreatedAt   int64  `firestore:"createdAt" json:"createdAt"`
}

func (s *Store) GetProfile(ctx context.Context, uid string) (Profile, error) {
	snap, err := s.fs.Collection("users").Doc(uid).Get(ctx)
	if notFound(err) {
		return Profile{}, ErrNotFound
	}
	if err != nil {
		return Profile{}, err
	}
	var p Profile
	if err := snap.DataTo(&p); err != nil {
		return Profile{}, err
	}
	p.UID = uid
	return p, nil
}

// PublicName reads the directory entry (publicProfiles/{uid}.name).
func (s *Store) PublicName(ctx context.Context, uid string) string {
	snap, err := s.fs.Collection("publicProfiles").Doc(uid).Get(ctx)
	if err != nil {
		return ""
	}
	name, _ := snap.Data()["name"].(string)
	return name
}

// MissingProfiles returns the uids that have no directory entry, i.e. that
// are not registered users.
func (s *Store) MissingProfiles(ctx context.Context, uids []string) ([]string, error) {
	refs := make([]*firestore.DocumentRef, len(uids))
	for i, uid := range uids {
		refs[i] = s.fs.Collection("publicProfiles").Doc(uid)
	}
	snaps, err := s.fs.GetAll(ctx, refs)
	if err != nil {
		return nil, err
	}
	var missing []string
	for i, snap := range snaps {
		if !snap.Exists() {
			missing = append(missing, uids[i])
		}
	}
	return missing, nil
}

// ---- conversations --------------------------------------------------------

func (s *Store) DirectConversationParticipants(ctx context.Context, conversationID string) ([]string, error) {
	snap, err := s.fs.Collection("directConversations").Doc(conversationID).Get(ctx)
	if notFound(err) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	var doc struct {
		ParticipantIDs []string `firestore:"participantIds"`
	}
	if err := snap.DataTo(&doc); err != nil {
		return nil, err
	}
	return doc.ParticipantIDs, nil
}

// SharesGroup reports whether a and b are both members of some group. The
// query is bounded by the groups a belongs to.
func (s *Store) SharesGroup(ctx context.Context, a, b string) (bool, error) {
	snaps, err := s.fs.Collection("groups").
		Where("memberIds", "array-contains", a).
		Select("memberIds").
		Documents(ctx).GetAll()
	if err != nil {
		return false, err
	}
	for _, snap := range snaps {
		var g domain.Group
		if err := snap.DataTo(&g); err == nil && g.HasMember(b) {
			return true, nil
		}
	}
	return false, nil
}

// ---- groups ---------------------------------------------------------------

func (s *Store) groupRef(id string) *firestore.DocumentRef {
	return s.fs.Collection("groups").Doc(id)
}

func (s *Store) GetGroup(ctx context.Context, id string) (domain.Group, error) {
	snap, err := s.groupRef(id).Get(ctx)
	if notFound(err) {
		return domain.Group{}, ErrNotFound
	}
	if err != nil {
		return domain.Group{}, err
	}
	return decodeGroup(snap)
}

func decodeGroup(snap *firestore.DocumentSnapshot) (domain.Group, error) {
	var g domain.Group
	if err := snap.DataTo(&g); err != nil {
		return domain.Group{}, fmt.Errorf("decode group %s: %w", snap.Ref.ID, err)
	}
	g.ID = snap.Ref.ID
	return g, nil
}

func (s *Store) NewGroupID() string { return s.fs.Collection("groups").NewDoc().ID }

func (s *Store) CreateGroup(ctx context.Context, g domain.Group) error {
	_, err := s.groupRef(g.ID).Create(ctx, g)
	return err
}

// MutateGroup runs fn inside a Firestore transaction. Server-side Firestore
// transactions lock the documents they read, so two concurrent "add member"
// requests are serialized: the second one re-reads the group after the
// first commits and is checked against the real member count.
func (s *Store) MutateGroup(ctx context.Context, id string, fn func(g *domain.Group) error) (domain.Group, error) {
	var result domain.Group
	err := s.fs.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		ref := s.groupRef(id)
		snap, err := tx.Get(ref)
		if notFound(err) {
			return ErrNotFound
		}
		if err != nil {
			return err
		}
		g, err := decodeGroup(snap)
		if err != nil {
			return err
		}
		if err := fn(&g); err != nil {
			return err
		}
		g.UpdatedAt = nowMillis()
		result = g
		return tx.Set(ref, g)
	})
	return result, err
}

func (s *Store) DeleteGroup(ctx context.Context, id string) error {
	_, err := s.groupRef(id).Delete(ctx)
	return err
}

// SyncGroupMirror writes groupMembers/{groupId} in the Realtime Database, the
// copy of memberIds that the RTDB rules consult to authorize message reads
// and writes. Firestore stays the source of truth; the mirror is rewritten
// after every membership change and on every push request (self-healing).
func (s *Store) SyncGroupMirror(ctx context.Context, groupID string, memberIDs []string) error {
	members := make(map[string]bool, len(memberIDs))
	for _, uid := range memberIDs {
		members[uid] = true
	}
	var err error
	for attempt := range 3 {
		if err = s.db.NewRef("groupMembers/"+groupID).Set(ctx, members); err == nil {
			return nil
		}
		time.Sleep(time.Duration(attempt+1) * 150 * time.Millisecond)
	}
	return fmt.Errorf("sync group mirror: %w", err)
}

// MirrorMatches reports whether the RTDB mirror equals memberIDs.
func (s *Store) MirrorMatches(ctx context.Context, groupID string, memberIDs []string) (bool, error) {
	var current map[string]bool
	if err := s.db.NewRef("groupMembers/"+groupID).Get(ctx, &current); err != nil {
		return false, err
	}
	if len(current) != len(memberIDs) {
		return false, nil
	}
	for _, uid := range memberIDs {
		if !current[uid] {
			return false, nil
		}
	}
	return true, nil
}

// DeleteGroupData removes the RTDB side of a deleted group.
func (s *Store) DeleteGroupData(ctx context.Context, groupID string) error {
	return s.db.NewRef("/").Update(ctx, map[string]any{
		"groupMembers/" + groupID: nil,
		"messages/" + groupID:     nil,
		"readMarks/" + groupID:    nil,
	})
}

// ---- messages -------------------------------------------------------------

func (s *Store) GetMessage(ctx context.Context, conversationID, messageID string) (domain.Message, error) {
	var raw json.RawMessage
	if err := s.db.NewRef("messages/"+conversationID+"/"+messageID).Get(ctx, &raw); err != nil {
		return domain.Message{}, err
	}
	if len(raw) == 0 || string(raw) == "null" {
		return domain.Message{}, ErrNotFound
	}
	var m domain.Message
	if err := json.Unmarshal(raw, &m); err != nil {
		return domain.Message{}, fmt.Errorf("decode message: %w", err)
	}
	return m, nil
}

// ---- devices --------------------------------------------------------------

type Device struct {
	UID   string
	Token string
	Ref   *firestore.DocumentRef
}

// EnabledDevices lists the push tokens of the given users
// (users/{uid}/devices where enabled == true). Duplicated tokens, e.g. one
// phone shared by two accounts, are returned once.
func (s *Store) EnabledDevices(ctx context.Context, uids []string) ([]Device, error) {
	type result struct {
		devices []Device
		err     error
	}
	results := make(chan result, len(uids))
	for _, uid := range uids {
		go func(uid string) {
			snaps, err := s.fs.Collection("users").Doc(uid).Collection("devices").
				Where("enabled", "==", true).Documents(ctx).GetAll()
			if err != nil {
				results <- result{err: err}
				return
			}
			var devices []Device
			for _, snap := range snaps {
				token, _ := snap.Data()["token"].(string)
				if token != "" {
					devices = append(devices, Device{UID: uid, Token: token, Ref: snap.Ref})
				}
			}
			results <- result{devices: devices}
		}(uid)
	}
	seen := map[string]bool{}
	var out []Device
	var firstErr error
	for range uids {
		r := <-results
		if r.err != nil && firstErr == nil {
			firstErr = r.err
		}
		for _, d := range r.devices {
			if !seen[d.Token] {
				seen[d.Token] = true
				out = append(out, d)
			}
		}
	}
	return out, firstErr
}

func (s *Store) DeleteDevices(ctx context.Context, refs []*firestore.DocumentRef) error {
	if len(refs) == 0 {
		return nil
	}
	bw := s.fs.BulkWriter(ctx)
	for _, ref := range refs {
		if _, err := bw.Delete(ref); err != nil {
			return err
		}
	}
	bw.End()
	return nil
}

// ---- idempotency ------------------------------------------------------------

const dispatchLease = 60 * time.Second

func (s *Store) dispatchRef(conversationID, messageID string) *firestore.DocumentRef {
	// Neither id can contain ':', so the composite id is unambiguous.
	return s.fs.Collection("notificationDispatches").Doc(conversationID + ":" + messageID)
}

type ClaimResult string

const (
	Claimed     ClaimResult = "claimed"
	AlreadySent ClaimResult = "already_sent"
	InProgress  ClaimResult = "in_progress"
)

// ClaimDispatch makes POST /notifications/messages idempotent: the first
// request for a message atomically creates its dispatch record and sends;
// replays find the record and send nothing. A request that crashed midway
// leaves a "processing" lease that expires, so a retry can still deliver.
func (s *Store) ClaimDispatch(ctx context.Context, conversationID, messageID, senderID string) (ClaimResult, error) {
	ref := s.dispatchRef(conversationID, messageID)
	var outcome ClaimResult
	err := s.fs.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		snap, err := tx.Get(ref)
		if err != nil && !notFound(err) {
			return err
		}
		now := time.Now()
		if err == nil && snap.Exists() {
			data := snap.Data()
			state, _ := data["status"].(string)
			leaseUntil, _ := data["leaseUntil"].(int64)
			if state == "sent" {
				outcome = AlreadySent
				return nil
			}
			if state == "processing" && leaseUntil > now.UnixMilli() {
				outcome = InProgress
				return nil
			}
		}
		outcome = Claimed
		return tx.Set(ref, map[string]any{
			"conversationId": conversationID,
			"messageId":      messageID,
			"senderId":       senderID,
			"status":         "processing",
			"leaseUntil":     now.Add(dispatchLease).UnixMilli(),
			"createdAt":      now.UnixMilli(),
			// Firestore TTL policy on this field purges old records.
			"expireAt": now.Add(30 * 24 * time.Hour),
		})
	})
	return outcome, err
}

func (s *Store) CompleteDispatch(ctx context.Context, conversationID, messageID string, summary map[string]any) error {
	update := map[string]any{"status": "sent", "completedAt": nowMillis()}
	for k, v := range summary {
		update[k] = v
	}
	_, err := s.dispatchRef(conversationID, messageID).Set(ctx, update, firestore.MergeAll)
	return err
}

// ReleaseDispatch drops a claim whose send failed before reaching FCM, so the
// client's retry is not mistaken for a duplicate.
func (s *Store) ReleaseDispatch(ctx context.Context, conversationID, messageID string) {
	_, _ = s.dispatchRef(conversationID, messageID).Delete(ctx)
}
