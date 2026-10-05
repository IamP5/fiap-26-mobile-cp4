// Package platform wires the Firebase Admin SDK from environment config.
package platform

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"cloud.google.com/go/firestore"
	firebase "firebase.google.com/go/v4"
	"firebase.google.com/go/v4/auth"
	"firebase.google.com/go/v4/db"
	"firebase.google.com/go/v4/messaging"
	"golang.org/x/oauth2"
	"google.golang.org/api/option"
)

type Config struct {
	Port          string
	ProjectID     string
	DatabaseURL   string
	StorageBucket string
	// Optional explicit service account. On Cloud Run these stay empty and
	// the service's attached identity (ADC) is used, so no key exists at all.
	ClientEmail string
	PrivateKey  string
	Version     string
}

func LoadConfig() (Config, error) {
	cfg := Config{
		Port:          getenv("PORT", "8080"),
		ProjectID:     os.Getenv("FIREBASE_PROJECT_ID"),
		DatabaseURL:   os.Getenv("FIREBASE_DATABASE_URL"),
		StorageBucket: os.Getenv("FIREBASE_STORAGE_BUCKET"),
		ClientEmail:   os.Getenv("FIREBASE_CLIENT_EMAIL"),
		// Hosting dashboards usually store the PEM with literal "\n".
		PrivateKey: strings.ReplaceAll(os.Getenv("FIREBASE_PRIVATE_KEY"), `\n`, "\n"),
		Version:    getenv("K_REVISION", "dev"),
	}
	if cfg.ProjectID == "" {
		return cfg, fmt.Errorf("FIREBASE_PROJECT_ID is required")
	}
	if cfg.DatabaseURL == "" {
		return cfg, fmt.Errorf("FIREBASE_DATABASE_URL is required")
	}
	if (cfg.ClientEmail == "") != (cfg.PrivateKey == "") {
		return cfg, fmt.Errorf("FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY must be set together")
	}
	return cfg, nil
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// Clients groups the Admin SDK services the API uses.
type Clients struct {
	Auth      *auth.Client
	Firestore *firestore.Client
	DB        *db.Client
	Messaging *messaging.Client
}

// NewClients builds every client up front. None of them performs network
// I/O at construction time, so this adds only a few milliseconds to a cold
// start; connections are opened by the first request.
func NewClients(ctx context.Context, cfg Config) (*Clients, error) {
	var opts []option.ClientOption
	if cfg.PrivateKey != "" {
		creds, err := json.Marshal(map[string]string{
			"type":         "service_account",
			"project_id":   cfg.ProjectID,
			"client_email": cfg.ClientEmail,
			"private_key":  cfg.PrivateKey,
			"token_uri":    "https://oauth2.googleapis.com/token",
		})
		if err != nil {
			return nil, err
		}
		opts = append(opts, option.WithAuthCredentialsJSON(option.ServiceAccount, creds))
	} else if os.Getenv("FIRESTORE_EMULATOR_HOST") != "" {
		// Local runs against the Emulator Suite need no Google credentials;
		// the emulators accept the "owner" token.
		opts = append(opts, option.WithTokenSource(oauth2.StaticTokenSource(&oauth2.Token{AccessToken: "owner"})))
	}

	app, err := firebase.NewApp(ctx, &firebase.Config{
		ProjectID:     cfg.ProjectID,
		DatabaseURL:   cfg.DatabaseURL,
		StorageBucket: cfg.StorageBucket,
	}, opts...)
	if err != nil {
		return nil, fmt.Errorf("firebase app: %w", err)
	}

	authClient, err := app.Auth(ctx)
	if err != nil {
		return nil, fmt.Errorf("auth client: %w", err)
	}
	fs, err := app.Firestore(ctx)
	if err != nil {
		return nil, fmt.Errorf("firestore client: %w", err)
	}
	database, err := app.Database(ctx)
	if err != nil {
		return nil, fmt.Errorf("database client: %w", err)
	}
	msg, err := app.Messaging(ctx)
	if err != nil {
		return nil, fmt.Errorf("messaging client: %w", err)
	}
	return &Clients{Auth: authClient, Firestore: fs, DB: database, Messaging: msg}, nil
}
