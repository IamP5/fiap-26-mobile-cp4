package api

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/fiap/cp4-chat/server/internal/domain"
	"github.com/fiap/cp4-chat/server/internal/httpx"
	"github.com/fiap/cp4-chat/server/internal/store"
)

// Group mutations live in the API (Firestore rules deny client writes to
// groups/*) for two reasons:
//  1. the member limit is enforced inside a Firestore transaction, which is
//     safe against concurrent additions;
//  2. every change must also update the RTDB membership mirror, a
//     cross-database write that rules cannot express.

type groupResponse struct {
	Group domain.Group `json:"group"`
}

var (
	errGroupNotFound = httpx.NewError(http.StatusNotFound, "GROUP_NOT_FOUND", "Grupo não encontrado.")
	errNotOwner      = httpx.NewError(http.StatusForbidden, "NOT_GROUP_OWNER", "Somente o proprietário pode gerenciar o grupo.")
	errInvalidPhoto  = httpx.NewError(http.StatusBadRequest, "INVALID_PHOTO_URL", "Foto do grupo inválida.")
	errInvalidPolicy = httpx.NewError(http.StatusBadRequest, "INVALID_POLICY", "Política de notificação inválida.")
)

// validPhotoURL accepts "" (default image) or a download URL of an object
// the caller uploaded to group-photos/{uid}/ in this project's bucket.
func (s *Server) validPhotoURL(url, uid string) bool {
	if url == "" {
		return true
	}
	if len(url) > 2048 || !isHTTPS(url) {
		return false
	}
	if s.cfg.StorageBucket == "" {
		return true
	}
	prefix := "https://firebasestorage.googleapis.com/v0/b/" + s.cfg.StorageBucket + "/o/group-photos%2F" + uid + "%2F"
	return strings.HasPrefix(url, prefix)
}

func (s *Server) ensureRegistered(ctx context.Context, uids []string) error {
	missing, err := s.store.MissingProfiles(ctx, uids)
	if err != nil {
		return err
	}
	if len(missing) > 0 {
		return httpx.NewError(http.StatusBadRequest, "UNKNOWN_MEMBER", "Um dos integrantes selecionados não está cadastrado.")
	}
	return nil
}

// syncMirror reports a failed mirror write in the response instead of
// failing the request: the Firestore change is already committed, and the
// mirror heals on the next sync or push request.
func (s *Server) syncMirror(ctx context.Context, g domain.Group) {
	if err := s.store.SyncGroupMirror(ctx, g.ID, g.MemberIDs); err != nil {
		slog.ErrorContext(ctx, "group mirror sync failed", "group", g.ID, "error", err.Error())
	}
}

func mapStoreErr(err error) error {
	if errors.Is(err, store.ErrNotFound) {
		return errGroupNotFound
	}
	return err
}

// ---- POST /groups -------------------------------------------------------------

type createGroupRequest struct {
	Name               string                    `json:"name"`
	PhotoURL           string                    `json:"photoUrl"`
	MemberIDs          []string                  `json:"memberIds"`
	MemberLimit        int64                     `json:"memberLimit"`
	NotificationPolicy domain.NotificationPolicy `json:"notificationPolicy"`
}

func (s *Server) createGroup(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	uid := httpx.UserID(ctx)

	var req createGroupRequest
	if err := httpx.DecodeJSON(r, &req); err != nil {
		return err
	}
	name, err := domain.NormalizeGroupName(req.Name)
	if err != nil {
		return err
	}
	if !req.NotificationPolicy.Valid() {
		return errInvalidPolicy
	}
	if !s.validPhotoURL(req.PhotoURL, uid) {
		return errInvalidPhoto
	}
	members, err := domain.PlanCreate(uid, req.MemberIDs, req.MemberLimit)
	if err != nil {
		return err
	}
	if err := s.ensureRegistered(ctx, members); err != nil {
		return err
	}

	now := time.Now().UnixMilli()
	g := domain.Group{
		ID:                          s.store.NewGroupID(),
		Name:                        name,
		PhotoURL:                    req.PhotoURL,
		OwnerID:                     uid,
		MemberIDs:                   members,
		MemberLimit:                 req.MemberLimit,
		NotificationPolicy:          req.NotificationPolicy,
		NotificationPolicyUpdatedBy: uid,
		NotificationPolicyUpdatedAt: now,
		CreatedAt:                   now,
		UpdatedAt:                   now,
	}
	// Mirror first: members can read the conversation as soon as the group
	// document appears in their list.
	s.syncMirror(ctx, g)
	if err := s.store.CreateGroup(ctx, g); err != nil {
		return err
	}
	httpx.WriteJSON(w, http.StatusCreated, groupResponse{Group: g})
	return nil
}

// ---- PATCH /groups/{groupId} --------------------------------------------------

type updateGroupRequest struct {
	Name               *string                    `json:"name"`
	PhotoURL           *string                    `json:"photoUrl"`
	MemberLimit        *int64                     `json:"memberLimit"`
	NotificationPolicy *domain.NotificationPolicy `json:"notificationPolicy"`
}

func (s *Server) updateGroup(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	uid := httpx.UserID(ctx)
	groupID := r.PathValue("groupId")
	if !domain.ValidGroupID(groupID) {
		return errGroupNotFound
	}

	var req updateGroupRequest
	if err := httpx.DecodeJSON(r, &req); err != nil {
		return err
	}
	var name string
	if req.Name != nil {
		normalized, err := domain.NormalizeGroupName(*req.Name)
		if err != nil {
			return err
		}
		name = normalized
	}
	if req.PhotoURL != nil && !s.validPhotoURL(*req.PhotoURL, uid) {
		return errInvalidPhoto
	}
	if req.NotificationPolicy != nil && !req.NotificationPolicy.Valid() {
		return errInvalidPolicy
	}

	g, err := s.store.MutateGroup(ctx, groupID, func(g *domain.Group) error {
		if g.OwnerID != uid {
			return errNotOwner
		}
		if req.Name != nil {
			g.Name = name
		}
		if req.PhotoURL != nil {
			g.PhotoURL = *req.PhotoURL
		}
		if req.MemberLimit != nil {
			// Checked against the member count read in this transaction.
			if err := domain.ValidateMemberLimit(*req.MemberLimit, len(g.MemberIDs)); err != nil {
				return err
			}
			g.MemberLimit = *req.MemberLimit
		}
		if req.NotificationPolicy != nil && *req.NotificationPolicy != g.NotificationPolicy {
			g.NotificationPolicy = *req.NotificationPolicy
			g.NotificationPolicyUpdatedBy = uid
			g.NotificationPolicyUpdatedAt = time.Now().UnixMilli()
		}
		return nil
	})
	if err != nil {
		return mapStoreErr(err)
	}
	httpx.WriteJSON(w, http.StatusOK, groupResponse{Group: g})
	return nil
}

// ---- POST /groups/{groupId}/members -------------------------------------------

type addMembersRequest struct {
	MemberIDs []string `json:"memberIds"`
}

func (s *Server) addMembers(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	uid := httpx.UserID(ctx)
	groupID := r.PathValue("groupId")
	if !domain.ValidGroupID(groupID) {
		return errGroupNotFound
	}

	var req addMembersRequest
	if err := httpx.DecodeJSON(r, &req); err != nil {
		return err
	}
	if len(req.MemberIDs) == 0 || len(req.MemberIDs) > domain.MaxMemberLimit {
		return httpx.ErrBadRequest
	}
	if err := domain.ValidateMemberIDs(req.MemberIDs); err != nil {
		return err
	}
	if err := s.ensureRegistered(ctx, req.MemberIDs); err != nil {
		return err
	}

	g, err := s.store.MutateGroup(ctx, groupID, func(g *domain.Group) error {
		if g.OwnerID != uid {
			return errNotOwner
		}
		merged, _, err := domain.PlanAddMembers(g.MemberIDs, req.MemberIDs, g.MemberLimit)
		if err != nil {
			return err
		}
		g.MemberIDs = merged
		return nil
	})
	if err != nil {
		return mapStoreErr(err)
	}
	s.syncMirror(ctx, g)
	httpx.WriteJSON(w, http.StatusOK, groupResponse{Group: g})
	return nil
}

// ---- DELETE /groups/{groupId}/members/{memberId} ------------------------------

func (s *Server) removeMember(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	uid := httpx.UserID(ctx)
	groupID := r.PathValue("groupId")
	memberID := r.PathValue("memberId")
	if !domain.ValidGroupID(groupID) || !domain.ValidUID(memberID) {
		return errGroupNotFound
	}

	g, err := s.store.MutateGroup(ctx, groupID, func(g *domain.Group) error {
		if g.OwnerID != uid {
			return errNotOwner
		}
		remaining, err := domain.PlanRemoveMember(*g, memberID)
		if err != nil {
			return err
		}
		g.MemberIDs = remaining
		return nil
	})
	if err != nil {
		return mapStoreErr(err)
	}
	// Revokes the removed user's RTDB access to the conversation.
	s.syncMirror(ctx, g)
	httpx.WriteJSON(w, http.StatusOK, groupResponse{Group: g})
	return nil
}

// ---- DELETE /groups/{groupId} ---------------------------------------------------

func (s *Server) deleteGroup(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	uid := httpx.UserID(ctx)
	groupID := r.PathValue("groupId")
	if !domain.ValidGroupID(groupID) {
		return errGroupNotFound
	}
	g, err := s.store.GetGroup(ctx, groupID)
	if err != nil {
		return mapStoreErr(err)
	}
	if g.OwnerID != uid {
		return errNotOwner
	}
	if err := s.store.DeleteGroup(ctx, groupID); err != nil {
		return err
	}
	if err := s.store.DeleteGroupData(ctx, groupID); err != nil {
		slog.ErrorContext(ctx, "group data cleanup failed", "group", groupID, "error", err.Error())
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

// ---- POST /groups/{groupId}/sync --------------------------------------------------

// syncGroup lets any member re-sync the RTDB mirror from Firestore, e.g. when
// the app finds it cannot read a group it is listed in.
func (s *Server) syncGroup(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	uid := httpx.UserID(ctx)
	groupID := r.PathValue("groupId")
	if !domain.ValidGroupID(groupID) {
		return errGroupNotFound
	}
	g, err := s.store.GetGroup(ctx, groupID)
	if err != nil {
		return mapStoreErr(err)
	}
	if !g.HasMember(uid) {
		return httpx.NewError(http.StatusForbidden, "NOT_A_MEMBER", "Você não faz parte deste grupo.")
	}
	if err := s.store.SyncGroupMirror(ctx, g.ID, g.MemberIDs); err != nil {
		return err
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]string{"status": "synced"})
	return nil
}
