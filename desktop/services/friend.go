package services

import (
	"errors"
	"time"
)

type FriendService struct{ proxy *ProxyClient }

func NewFriendService(proxy *ProxyClient) *FriendService {
	return &FriendService{proxy: proxy}
}

type FriendDTO struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	URL         string    `json:"url"`
	Description *string   `json:"description,omitempty"`
	Avatar      *string   `json:"avatar,omitempty"`
	Featured    bool      `json:"featured"`
	SortOrder   int       `json:"sortOrder"`
	IsActive    bool      `json:"isActive"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

type CreateFriendParams struct {
	Name        string `json:"name"`
	URL         string `json:"url"`
	Description string `json:"description"`
	Avatar      string `json:"avatar"`
	Featured    bool   `json:"featured"`
	SortOrder   int    `json:"sortOrder"`
	IsActive    bool   `json:"isActive"`
}

type UpdateFriendParams struct {
	Name        *string `json:"name,omitempty"`
	URL         *string `json:"url,omitempty"`
	Description *string `json:"description,omitempty"`
	Avatar      *string `json:"avatar,omitempty"`
	Featured    *bool   `json:"featured,omitempty"`
	SortOrder   *int    `json:"sortOrder,omitempty"`
	IsActive    *bool   `json:"isActive,omitempty"`
}

func (s *FriendService) checkReady() error {
	if s.proxy == nil || !s.proxy.IsReady() {
		return errors.New("未连接到服务器")
	}
	return nil
}

func (s *FriendService) List() ([]FriendDTO, error) {
	if err := s.checkReady(); err != nil {
		return nil, err
	}
	var friends []FriendDTO
	if err := s.proxy.GET("/admin/friends", &friends); err != nil {
		return nil, err
	}
	return friends, nil
}

func (s *FriendService) Create(params CreateFriendParams) (*FriendDTO, error) {
	if err := s.checkReady(); err != nil {
		return nil, err
	}
	if params.Name == "" || params.URL == "" {
		return nil, errors.New("名称和URL不能为空")
	}
	var friend FriendDTO
	if err := s.proxy.POST("/admin/friends", params, &friend); err != nil {
		return nil, err
	}
	return &friend, nil
}

func (s *FriendService) Update(id string, params UpdateFriendParams) (*FriendDTO, error) {
	if err := s.checkReady(); err != nil {
		return nil, err
	}
	var friend FriendDTO
	if err := s.proxy.PATCH("/admin/friends/"+id, params, &friend); err != nil {
		return nil, err
	}
	return &friend, nil
}

func (s *FriendService) Delete(id string) error {
	if err := s.checkReady(); err != nil {
		return err
	}
	return s.proxy.DELETE("/admin/friends/" + id)
}
