package services

import (
	"errors"
	"net/url"
	"time"
)

type FilmRollService struct{ proxy *ProxyClient }

func NewFilmRollService(proxy *ProxyClient) *FilmRollService {
	return &FilmRollService{proxy: proxy}
}

type FilmRollDTO struct {
	ID         string         `json:"id"`
	Name       string         `json:"name"`
	Brand      string         `json:"brand"`
	Format     string         `json:"format"`
	ISO        int            `json:"iso"`
	FrameCount int            `json:"frameCount"`
	Notes      *string        `json:"notes,omitempty"`
	ShootDate  *time.Time     `json:"shootDate,omitempty"`
	EndDate    *time.Time     `json:"endDate,omitempty"`
	PhotoCount int            `json:"photoCount"`
	CreatedAt  time.Time      `json:"createdAt"`
	UpdatedAt  time.Time      `json:"updatedAt"`
	FilmPhotos []FilmPhotoDTO `json:"filmPhotos,omitempty"`
}

type FilmPhotoDTO struct {
	ID          string    `json:"id"`
	FilmRollID  string    `json:"filmRollId"`
	PhotoID     string    `json:"photoId"`
	FrameNumber int       `json:"frameNumber"`
	CreatedAt   time.Time `json:"createdAt"`
	Photo       *PhotoDTO `json:"photo,omitempty"`
}

type CreateFilmRollParams struct {
	Name       string     `json:"name"`
	Brand      string     `json:"brand"`
	Format     string     `json:"format"`
	ISO        int        `json:"iso"`
	FrameCount int        `json:"frameCount"`
	Notes      *string    `json:"notes,omitempty"`
	ShootDate  *time.Time `json:"shootDate,omitempty"`
	EndDate    *time.Time `json:"endDate,omitempty"`
}

type UpdateFilmRollParams struct {
	Name       *string    `json:"name,omitempty"`
	Brand      *string    `json:"brand,omitempty"`
	Format     *string    `json:"format,omitempty"`
	ISO        *int       `json:"iso,omitempty"`
	FrameCount *int       `json:"frameCount,omitempty"`
	Notes      *string    `json:"notes,omitempty"`
	ShootDate  *time.Time `json:"shootDate,omitempty"`
	EndDate    *time.Time `json:"endDate,omitempty"`
}

func (s *FilmRollService) checkReady() error {
	if s.proxy == nil || !s.proxy.IsReady() {
		return errors.New("not connected to server")
	}
	return nil
}

func (s *FilmRollService) List() ([]FilmRollDTO, error) {
	if err := s.checkReady(); err != nil {
		return nil, err
	}
	var rolls []FilmRollDTO
	if err := s.proxy.GET("/film-rolls", &rolls); err != nil {
		return nil, err
	}
	return rolls, nil
}

func (s *FilmRollService) GetByID(id string) (*FilmRollDTO, error) {
	if err := s.checkReady(); err != nil {
		return nil, err
	}
	var roll FilmRollDTO
	if err := s.proxy.GET("/film-rolls/"+url.PathEscape(id), &roll); err != nil {
		return nil, err
	}
	return &roll, nil
}

func (s *FilmRollService) Create(params CreateFilmRollParams) (*FilmRollDTO, error) {
	if err := s.checkReady(); err != nil {
		return nil, err
	}
	if params.Name == "" {
		return nil, errors.New("film roll name is required")
	}
	if params.Brand == "" {
		return nil, errors.New("film roll brand is required")
	}
	if params.Format == "" {
		params.Format = "135"
	}
	var roll FilmRollDTO
	if err := s.proxy.POST("/admin/film-rolls", params, &roll); err != nil {
		return nil, err
	}
	return &roll, nil
}

func (s *FilmRollService) Update(id string, params UpdateFilmRollParams) (*FilmRollDTO, error) {
	if err := s.checkReady(); err != nil {
		return nil, err
	}
	var roll FilmRollDTO
	if err := s.proxy.PATCH("/admin/film-rolls/"+url.PathEscape(id), params, &roll); err != nil {
		return nil, err
	}
	return &roll, nil
}

func (s *FilmRollService) Delete(id string) error {
	if err := s.checkReady(); err != nil {
		return err
	}
	return s.proxy.DELETE("/admin/film-rolls/" + url.PathEscape(id))
}

func (s *FilmRollService) AddPhotos(id string, photoIDs []string) (*FilmRollDTO, error) {
	if err := s.checkReady(); err != nil {
		return nil, err
	}
	var roll FilmRollDTO
	if err := s.proxy.POST("/admin/film-rolls/"+url.PathEscape(id)+"/photos", map[string]interface{}{"photoIds": photoIDs}, &roll); err != nil {
		return nil, err
	}
	return &roll, nil
}

func (s *FilmRollService) RemovePhoto(rollID, photoID string) (*FilmRollDTO, error) {
	if err := s.checkReady(); err != nil {
		return nil, err
	}
	var roll FilmRollDTO
	path := "/admin/film-rolls/" + url.PathEscape(rollID) + "/photos/" + url.PathEscape(photoID)
	if err := s.proxy.DELETEWithResult(path, &roll); err != nil {
		return nil, err
	}
	return &roll, nil
}

func (s *FilmRollService) ReorderFrames(id string) (*FilmRollDTO, error) {
	if err := s.checkReady(); err != nil {
		return nil, err
	}
	var roll FilmRollDTO
	if err := s.proxy.POST("/admin/film-rolls/"+url.PathEscape(id)+"/reorder-frames", nil, &roll); err != nil {
		return nil, err
	}
	return &roll, nil
}
