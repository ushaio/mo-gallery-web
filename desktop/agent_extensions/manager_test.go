package agent_extensions

import (
	"archive/zip"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

type testCredentialStore struct {
	values map[string]string
}

func (s *testCredentialStore) Set(reference, value string) error {
	if s.values == nil {
		s.values = map[string]string{}
	}
	s.values[reference] = value
	return nil
}

func (s *testCredentialStore) Get(reference string) (string, error) {
	value, ok := s.values[reference]
	if !ok {
		return "", errors.New("credential not found")
	}
	return value, nil
}

func (s *testCredentialStore) Delete(reference string) error {
	delete(s.values, reference)
	return nil
}

func TestSnapshotNormalizesEmptyCollections(t *testing.T) {
	manager := &Manager{}
	snapshot := manager.Snapshot()
	data, err := json.Marshal(snapshot)
	if err != nil {
		t.Fatal(err)
	}
	serialized := string(data)
	for _, expected := range []string{`"skills":[]`, `"mcpServers":[]`, `"authorizations":[]`, `"audits":[]`} {
		if !strings.Contains(serialized, expected) {
			t.Fatalf("snapshot must serialize empty collections as arrays: %s", serialized)
		}
	}
}

func TestSnapshotNormalizesNestedMCPCollections(t *testing.T) {
	manager := &Manager{snapshot: AgentExtensionSnapshot{MCPServers: []MCPServer{{ID: "example"}}}}
	snapshot := manager.Snapshot()
	if len(snapshot.MCPServers) != 1 || snapshot.MCPServers[0].Args == nil || snapshot.MCPServers[0].Env == nil || snapshot.MCPServers[0].Tools == nil {
		t.Fatalf("nested MCP collections were not normalized: %#v", snapshot.MCPServers)
	}
}

func TestSaveMCPServerPreservesExistingSecretReference(t *testing.T) {
	root := t.TempDir()
	credentials := &testCredentialStore{}
	manager := &Manager{
		path:        filepath.Join(root, "agent-extensions.json"),
		installRoot: filepath.Join(root, "agent-extensions"),
		credentials: credentials,
		runtimes:    map[string]*mcpRuntime{},
	}

	first, err := manager.SaveMCPServer(MCPServerInput{
		Name:    "Example",
		Command: "example",
		Enabled: true,
		Env: []MCPEnvironmentVariable{{
			Name:   "API_TOKEN",
			Value:  "secret-value",
			Secret: true,
		}},
	})
	if err != nil {
		t.Fatal(err)
	}
	second, err := manager.SaveMCPServer(MCPServerInput{
		ID:      first.ID,
		Name:    first.Name,
		Command: first.Command,
		Enabled: true,
		Env:     []MCPEnvironmentVariable{{Name: "API_TOKEN", Secret: true}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if second.Env[0].CredentialRef == "" || second.Env[0].Value != "" {
		t.Fatalf("secret reference was not preserved: %#v", second.Env[0])
	}
	if got, _ := credentials.Get(second.Env[0].CredentialRef); got != "secret-value" {
		t.Fatalf("stored secret changed unexpectedly: %q", got)
	}
	data, err := os.ReadFile(manager.path)
	if err != nil {
		t.Fatal(err)
	}
	if string(data) == "" || !json.Valid(data) {
		t.Fatalf("snapshot is not valid JSON: %s", data)
	}
	if strings.Contains(string(data), "secret-value") {
		t.Fatal("secret value was persisted in the snapshot")
	}
}

func TestPrepareSkillSourceResolvesSingleNestedSkill(t *testing.T) {
	root := t.TempDir()
	skillRoot := filepath.Join(root, "repository", "skills", "example-skill")
	if err := os.MkdirAll(skillRoot, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(skillRoot, "SKILL.md"), []byte("---\nname: example\ndescription: nested skill\n---\nInstructions"), 0644); err != nil {
		t.Fatal(err)
	}

	resolved, cleanup, err := prepareSkillSources(filepath.Join(root, "repository"), t.TempDir())
	defer cleanup()
	if err != nil {
		t.Fatal(err)
	}
	if len(resolved) != 1 || resolved[0] != skillRoot {
		t.Fatalf("resolved unexpected Skill roots: got %q want %q", resolved, skillRoot)
	}
}

func TestPrepareSkillSourceStagesStandaloneSkillMarkdown(t *testing.T) {
	root := t.TempDir()
	source := filepath.Join(root, "SKILL.md")
	if err := os.WriteFile(source, []byte("---\nname: standalone\ndescription: single file skill\n---\nInstructions"), 0644); err != nil {
		t.Fatal(err)
	}
	installRoot := t.TempDir()
	resolved, cleanup, err := prepareSkillSources(source, installRoot)
	if err != nil {
		t.Fatal(err)
	}
	defer cleanup()
	if len(resolved) != 1 || resolved[0] == source || !strings.HasPrefix(resolved[0], filepath.Join(installRoot, "skill-import-")) {
		t.Fatalf("standalone Skill was not staged: got %q", resolved)
	}
	if _, err := os.Stat(filepath.Join(resolved[0], "SKILL.md")); err != nil {
		t.Fatalf("staged SKILL.md is missing: %v", err)
	}
}

func TestPrepareSkillSourcesResolvesMultipleNestedSkills(t *testing.T) {
	root := t.TempDir()
	for _, name := range []string{"first", "second"} {
		skillRoot := filepath.Join(root, "skills", name)
		if err := os.MkdirAll(skillRoot, 0755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(skillRoot, "SKILL.md"), []byte("---\nname: "+name+"\ndescription: nested skill\n---\nInstructions"), 0644); err != nil {
			t.Fatal(err)
		}
	}

	resolved, cleanup, err := prepareSkillSources(root, t.TempDir())
	defer cleanup()
	if err != nil {
		t.Fatal(err)
	}
	if len(resolved) != 2 {
		t.Fatalf("expected two Skill roots, got %q", resolved)
	}
	for index, expected := range []string{"first", "second"} {
		if filepath.Base(resolved[index]) != expected {
			t.Fatalf("unexpected Skill root at %d: got %q want %q", index, resolved[index], expected)
		}
	}
}

func TestImportSkillsInstallsMultipleSkillsAndReadsTheirReadmes(t *testing.T) {
	sourceRoot := t.TempDir()
	for _, name := range []string{"first", "second"} {
		skillRoot := filepath.Join(sourceRoot, "skills", name)
		if err := os.MkdirAll(skillRoot, 0755); err != nil {
			t.Fatal(err)
		}
		manifest := "---\nname: " + name + "\ndescription: " + name + " skill\n---\nInstructions"
		if err := os.WriteFile(filepath.Join(skillRoot, "SKILL.md"), []byte(manifest), 0644); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(skillRoot, "README.md"), []byte("# "+name+"\n\nIntroduction"), 0644); err != nil {
			t.Fatal(err)
		}
	}

	configRoot := t.TempDir()
	installRoot := filepath.Join(configRoot, "agent-extensions")
	if err := os.MkdirAll(installRoot, 0755); err != nil {
		t.Fatal(err)
	}
	manager := &Manager{
		path:        filepath.Join(configRoot, "agent-extensions.json"),
		installRoot: installRoot,
	}
	imported, err := manager.ImportSkills(sourceRoot)
	if err != nil {
		t.Fatal(err)
	}
	if len(imported) != 2 || len(manager.ListSkills()) != 2 {
		t.Fatalf("expected two imported Skills, got imported=%d snapshot=%d", len(imported), len(manager.ListSkills()))
	}
	for _, skill := range imported {
		if skill.SourcePath != sourceRoot {
			t.Fatalf("unexpected source path for %s: %q", skill.ID, skill.SourcePath)
		}
		content, readErr := manager.ReadSkill(skill.ID)
		if readErr != nil {
			t.Fatal(readErr)
		}
		if !strings.Contains(content.Readme, "# "+skill.Name) {
			t.Fatalf("README for %s was not loaded: %q", skill.ID, content.Readme)
		}
	}
}

func TestPrepareSkillSourceRejectsDirectoryWithoutSkillManifest(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "README.md"), []byte("not a Skill"), 0644); err != nil {
		t.Fatal(err)
	}

	_, cleanup, err := prepareSkillSources(root, t.TempDir())
	defer cleanup()
	if err == nil || !strings.Contains(err.Error(), "未在") {
		t.Fatalf("expected a useful missing manifest error, got %v", err)
	}
}

func TestPrepareSkillSourcesResolvesMultipleSkillsFromArchive(t *testing.T) {
	archivePath := filepath.Join(t.TempDir(), "skills.zip")
	file, err := os.Create(archivePath)
	if err != nil {
		t.Fatal(err)
	}
	writer := zip.NewWriter(file)
	for _, name := range []string{"first", "second"} {
		entry, createErr := writer.Create("skills/" + name + "/SKILL.md")
		if createErr != nil {
			t.Fatal(createErr)
		}
		if _, writeErr := entry.Write([]byte("---\nname: " + name + "\ndescription: archived skill\n---\nInstructions")); writeErr != nil {
			t.Fatal(writeErr)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}

	resolved, cleanup, err := prepareSkillSources(archivePath, t.TempDir())
	defer cleanup()
	if err != nil {
		t.Fatal(err)
	}
	if len(resolved) != 2 {
		t.Fatalf("expected two Skill roots from archive, got %q", resolved)
	}
}

func TestPrepareSkillSourceRejectsDuplicateArchiveEntries(t *testing.T) {
	archivePath := filepath.Join(t.TempDir(), "duplicate.zip")
	file, err := os.Create(archivePath)
	if err != nil {
		t.Fatal(err)
	}
	writer := zip.NewWriter(file)
	for _, content := range []string{"name: test\ndescription: one\n", "name: test\ndescription: two\n"} {
		entry, createErr := writer.Create("SKILL.md")
		if createErr != nil {
			t.Fatal(createErr)
		}
		if _, writeErr := entry.Write([]byte(content)); writeErr != nil {
			t.Fatal(writeErr)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}
	_, cleanup, err := prepareSkillSources(archivePath, t.TempDir())
	cleanup()
	if err == nil {
		t.Fatal("expected duplicate archive entry to be rejected")
	}
}

func TestReadSkillResourceUsesProgressiveDisclosureAndRejectsTraversal(t *testing.T) {
	root := t.TempDir()
	installPath := filepath.Join(root, "skills", "demo")
	if err := os.MkdirAll(filepath.Join(installPath, "references"), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(installPath, "SKILL.md"), []byte("---\nname: demo\ndescription: demo\n---\nUse the reference only when needed."), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(installPath, "references", "guide.md"), []byte("reference content"), 0644); err != nil {
		t.Fatal(err)
	}
	manager := &Manager{snapshot: AgentExtensionSnapshot{Skills: []Skill{{ID: "demo", Name: "demo", Enabled: true, ValidationStatus: "valid", InstallPath: installPath}}}}
	instructions, err := manager.ReadSkillResource("demo", "SKILL.md")
	if err != nil {
		t.Fatal(err)
	}
	if instructions.Content != "Use the reference only when needed." || len(instructions.References) != 1 || instructions.References[0] != "references/guide.md" {
		t.Fatalf("unexpected progressive resource: %#v", instructions)
	}
	reference, err := manager.ReadSkillResource("demo", "references/guide.md")
	if err != nil || reference.Content != "reference content" {
		t.Fatalf("reference read failed: %#v %v", reference, err)
	}
	if _, err := manager.ReadSkillResource("demo", "references/../SKILL.md"); err == nil {
		t.Fatal("expected traversal path to be rejected")
	}
}

func TestSummarizeArgumentsRedactsNestedSecrets(t *testing.T) {
	summary := summarizeArguments(map[string]any{
		"name":        "demo",
		"credentials": map[string]any{"apiKey": "super-secret", "nested": []any{map[string]any{"password": "another-secret"}}},
	})
	if contains := summary == "" || summary == "super-secret"; contains {
		t.Fatalf("unexpected summary: %q", summary)
	}
	for _, secret := range []string{"super-secret", "another-secret"} {
		if stringContains(summary, secret) {
			t.Fatalf("secret leaked in summary: %q", summary)
		}
	}
}

func stringContains(value, needle string) bool {
	for index := 0; index+len(needle) <= len(value); index++ {
		if value[index:index+len(needle)] == needle {
			return true
		}
	}
	return false
}
