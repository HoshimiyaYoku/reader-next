CREATE TABLE IF NOT EXISTS book_source_runtime_states (
    user_ns TEXT NOT NULL,
    book_source_url TEXT NOT NULL,
    json TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_ns, book_source_url),
    FOREIGN KEY (user_ns, book_source_url)
        REFERENCES book_sources(user_ns, book_source_url)
        ON DELETE CASCADE
);
