package db

import (
	"sync"
	"testing"

	"gorm.io/gorm/schema"
)

func TestPublishedFieldsUsePrismaColumnNames(t *testing.T) {
	tests := []struct {
		name      string
		model     any
		fieldName string
	}{
		{name: "story", model: &Story{}, fieldName: "IsPublished"},
		{name: "blog", model: &Blog{}, fieldName: "IsPublished"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			parsedSchema, err := schema.Parse(tt.model, &sync.Map{}, schema.NamingStrategy{})
			if err != nil {
				t.Fatalf("parse schema: %v", err)
			}

			field := parsedSchema.LookUpField(tt.fieldName)
			if field == nil {
				t.Fatalf("field %s not found", tt.fieldName)
			}

			if field.DBName != "isPublished" {
				t.Fatalf("%s.%s DBName = %q, want %q", tt.name, tt.fieldName, field.DBName, "isPublished")
			}
		})
	}
}
