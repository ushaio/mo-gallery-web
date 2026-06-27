package services

import (
	"errors"
	"time"
)

type CommentService struct{ proxy *ProxyClient }

func NewCommentService(proxy *ProxyClient) *CommentService {
	return &CommentService{proxy: proxy}
}

type CommentDTO struct {
	ID        string    `json:"id"`
	PhotoID   string    `json:"photoId"`
	Author    string    `json:"author"`
	Email     *string   `json:"email,omitempty"`
	AvatarURL *string   `json:"avatarUrl,omitempty"`
	Content   string    `json:"content"`
	Status    string    `json:"status"`
	IP        *string   `json:"ip,omitempty"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type ListCommentsParams struct {
	Status  string `json:"status"`
	PhotoID string `json:"photoId"`
	Page    int    `json:"page"`
	Limit   int    `json:"limit"`
}

func (s *CommentService) checkReady() error {
	if s.proxy == nil || !s.proxy.IsReady() {
		return errors.New("未连接到服务器")
	}
	return nil
}

func (s *CommentService) List(params ListCommentsParams) (*PaginatedResponse[CommentDTO], error) {
	if err := s.checkReady(); err != nil {
		return nil, err
	}
	if params.Page <= 0 {
		params.Page = 1
	}
	if params.Limit <= 0 {
		params.Limit = 20
	}

	q := buildQuery(map[string]string{
		"status":  params.Status,
		"photoId": params.PhotoID,
		"page":    itoa(params.Page),
		"limit":   itoa(params.Limit),
	})

	var comments []CommentDTO
	var meta PaginationMeta
	if err := s.proxy.GETWithMeta("/admin/comments?"+q, &comments, &meta); err != nil {
		return nil, err
	}
	return &PaginatedResponse[CommentDTO]{Data: comments, Meta: meta}, nil
}

func (s *CommentService) UpdateStatus(id string, status string) error {
	if err := s.checkReady(); err != nil {
		return err
	}
	if status != "pending" && status != "approved" && status != "rejected" {
		return errors.New("无效的评论状态")
	}
	return s.proxy.PATCH("/admin/comments/"+id+"/status", map[string]string{"status": status}, nil)
}

func (s *CommentService) Delete(id string) error {
	if err := s.checkReady(); err != nil {
		return err
	}
	return s.proxy.DELETE("/admin/comments/" + id)
}
