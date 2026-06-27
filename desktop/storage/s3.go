package storage

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

// S3Provider S3/R2 兼容存储
type S3Provider struct {
	client    *s3.Client
	bucket    string
	publicURL string
	basePath  string
}

func NewS3Provider(cfg Config) (*S3Provider, error) {
	if cfg.Bucket == "" {
		return nil, fmt.Errorf("S3 bucket is required")
	}

	opts := s3.Options{
		Region:      cfg.Region,
		Credentials: credentials.NewStaticCredentialsProvider(cfg.AccessKey, cfg.SecretKey, ""),
	}

	if cfg.Endpoint != "" {
		opts.BaseEndpoint = aws.String(cfg.Endpoint)
	}

	client := s3.New(opts)

	return &S3Provider{
		client:    client,
		bucket:    cfg.Bucket,
		publicURL: strings.TrimRight(cfg.PublicURL, "/"),
		basePath:  strings.Trim(cfg.BasePath, "/"),
	}, nil
}

// Upload 上传文件到 S3，返回公开访问 URL
func (p *S3Provider) Upload(key string, data io.Reader, contentType string) (string, error) {
	fullKey := key
	if p.basePath != "" {
		fullKey = p.basePath + "/" + key
	}

	// 读取全部内容（S3 需要 ContentLength）
	buf, err := io.ReadAll(data)
	if err != nil {
		return "", fmt.Errorf("读取文件失败: %w", err)
	}

	_, err = p.client.PutObject(context.TODO(), &s3.PutObjectInput{
		Bucket:      aws.String(p.bucket),
		Key:         aws.String(fullKey),
		Body:        bytes.NewReader(buf),
		ContentType: aws.String(contentType),
	})
	if err != nil {
		return "", fmt.Errorf("S3 上传失败: %w", err)
	}

	// 构造公开 URL
	if p.publicURL != "" {
		return p.publicURL + "/" + fullKey, nil
	}
	return fmt.Sprintf("https://%s.s3.amazonaws.com/%s", p.bucket, fullKey), nil
}

// Delete 从 S3 删除文件
func (p *S3Provider) Delete(key string) error {
	fullKey := key
	if p.basePath != "" {
		fullKey = p.basePath + "/" + key
	}

	_, err := p.client.DeleteObject(context.TODO(), &s3.DeleteObjectInput{
		Bucket: aws.String(p.bucket),
		Key:    aws.String(fullKey),
	})
	return err
}
