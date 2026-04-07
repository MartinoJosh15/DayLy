import { useEffect, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import {
  beginSpotifyLogin,
  clearSpotifySession,
  ensureSpotifySession,
  getSpotifyConfig,
  getStoredSpotifySession,
  maybeCompleteSpotifyLogin,
  spotifyApiFetch,
} from "../utils/spotify";

const SEARCH_FILTERS = [
  { id: "all", label: "All" },
  { id: "track", label: "Songs" },
  { id: "album", label: "Albums" },
  { id: "playlist", label: "Playlists" },
];

function getEmbedUrl(item) {
  if (!item?.id || !item?.type) return "";
  return `https://open.spotify.com/embed/${item.type}/${item.id}?utm_source=generator&theme=0`;
}

function getItemSubtitle(item) {
  if (!item) return "";

  if (item.type === "track") {
    return item.artists || item.contextLine || "";
  }

  if (item.type === "album") {
    return [item.artists, item.contextLine].filter(Boolean).join(" • ");
  }

  if (item.type === "playlist") {
    return item.contextLine || item.artists || "";
  }

  return item.contextLine || "";
}

function formatTypeLabel(type) {
  if (type === "track") return "Song";
  if (type === "album") return "Album";
  if (type === "playlist") return "Playlist";
  return "Spotify";
}

function mapTrack(item) {
  return {
    id: item.id,
    type: "track",
    name: item.name,
    artists: item.artists?.map((artist) => artist.name).join(", ") || "",
    contextLine: item.album?.name || "",
    imageUrl: item.album?.images?.[2]?.url || item.album?.images?.[0]?.url || "",
    spotifyUrl: item.external_urls?.spotify || "",
  };
}

function mapAlbum(item) {
  return {
    id: item.id,
    type: "album",
    name: item.name,
    artists: item.artists?.map((artist) => artist.name).join(", ") || "",
    contextLine: item.total_tracks ? `${item.total_tracks} tracks` : "Album",
    imageUrl: item.images?.[2]?.url || item.images?.[0]?.url || "",
    spotifyUrl: item.external_urls?.spotify || "",
  };
}

function mapPlaylist(item) {
  return {
    id: item.id,
    type: "playlist",
    name: item.name,
    artists: item.owner?.display_name || "",
    contextLine:
      typeof item.tracks?.total === "number" ? `${item.tracks.total} tracks` : "Playlist",
    imageUrl: item.images?.[2]?.url || item.images?.[0]?.url || "",
    spotifyUrl: item.external_urls?.spotify || "",
  };
}

export default function SpotifyPanel() {
  const config = getSpotifyConfig();
  const playerShellRef = useRef(null);
  const [spotifySession, setSpotifySession] = useState(() => getStoredSpotifySession());
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [searchFilter, setSearchFilter] = useState("all");
  const [status, setStatus] = useState(
    "Connect Spotify to search songs, albums, and playlists inside your workspace."
  );

  useEffect(() => {
    let mounted = true;

    maybeCompleteSpotifyLogin()
      .then((session) => {
        if (!mounted || !session) return;
        setSpotifySession(session);
        setStatus("Spotify connected. Search for a song, album, or playlist to load in the player.");
        toast.success("Spotify connected.");
      })
      .catch((error) => {
        if (!mounted) return;
        toast.error(error instanceof Error ? error.message : "Spotify sign-in failed.");
        setStatus("Spotify sign-in did not finish. Try connecting again.");
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedItem || !playerShellRef.current) return;

    playerShellRef.current.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }, [selectedItem]);

  async function withSpotifySession(action) {
    if (!spotifySession) {
      toast.error("Connect Spotify first.");
      return null;
    }

    const activeSession = await ensureSpotifySession(spotifySession);
    setSpotifySession(activeSession);
    return action(activeSession);
  }

  async function handleConnect() {
    try {
      setBusy(true);
      await beginSpotifyLogin();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Spotify sign-in failed.");
      setBusy(false);
    }
  }

  function handleDisconnect() {
    clearSpotifySession();
    setSpotifySession(null);
    setResults([]);
    setQuery("");
    setSelectedItem(null);
    setStatus("Spotify disconnected from this workspace.");
  }

  async function handleSearch(event) {
    event.preventDefault();

    if (!query.trim()) {
      setResults([]);
      return;
    }

    setBusy(true);

    try {
      await withSpotifySession(async (session) => {
        const searchTypes = searchFilter === "all" ? "track,album,playlist" : searchFilter;
        const data = await spotifyApiFetch(
          `/search?type=${encodeURIComponent(searchTypes)}&limit=4&q=${encodeURIComponent(query.trim())}`,
          session.accessToken
        );

        const combinedResults = [
          ...(data?.tracks?.items || []).map(mapTrack),
          ...(data?.albums?.items || []).map(mapAlbum),
          ...(data?.playlists?.items || []).map(mapPlaylist),
        ];

        setResults(combinedResults);

        if (combinedResults.length) {
          setStatus("Pick a song, album, or playlist to load it into the Spotify player.");
        } else {
          setStatus("No Spotify results matched that search.");
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Spotify search failed.";
      toast.error(message);
      setStatus(message);
    } finally {
      setBusy(false);
    }
  }

  function handleSelectItem(item) {
    setSelectedItem(item);
    setStatus(`Loaded ${item.name} ${item.type === "track" ? "in" : "into"} the embedded player.`);
  }

  const isConfigured = Boolean(config.clientId);
  const embedUrl = getEmbedUrl(selectedItem);

  return (
    <section className="spotify-panel">
      <div className="spotify-panel-header">
        <div className="spotify-panel-heading">
          <div className="sidebar-section-label spotify-section-label">Spotify Workspace</div>
          <div className="spotify-panel-title">Focus soundtrack</div>
          <div className="spotify-panel-copy">Search songs, albums, or playlists and keep them beside your planner.</div>
        </div>
        {spotifySession ? (
          <button type="button" className="spotify-link-btn" onClick={handleDisconnect}>
            Disconnect
          </button>
        ) : null}
      </div>

      {!isConfigured ? (
        <div className="spotify-setup-note">
          Add <code>VITE_SPOTIFY_CLIENT_ID</code> to connect Spotify here.
        </div>
      ) : spotifySession ? (
        <>
          <div className="spotify-status-card">
            <div className="spotify-status-line">
              <span className="spotify-dot ready" />
              <span>{status}</span>
            </div>
          </div>

          {selectedItem ? (
            <div className="spotify-now-playing spotify-now-playing-selected">
              {selectedItem.imageUrl ? (
                <img src={selectedItem.imageUrl} alt={selectedItem.name} className="spotify-artwork" />
              ) : (
                <div className="spotify-artwork spotify-artwork-placeholder">S</div>
              )}
              <div className="spotify-track-meta">
                <div className="spotify-type-badge">{formatTypeLabel(selectedItem.type)}</div>
                <strong>{selectedItem.name}</strong>
                <span>{getItemSubtitle(selectedItem)}</span>
              </div>
            </div>
          ) : (
            <div className="spotify-empty-state">Search for a song, album, or playlist, then load it below.</div>
          )}

          <div className="spotify-section-shell">
            <div className="spotify-mini-label">Search</div>
            <div className="spotify-filter-row">
              {SEARCH_FILTERS.map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  className={`spotify-filter-chip ${searchFilter === filter.id ? "active" : ""}`}
                  onClick={() => setSearchFilter(filter.id)}
                >
                  {filter.label}
                </button>
              ))}
            </div>
            <form className="spotify-search-form" onSubmit={handleSearch}>
              <input
                className="spotify-search-input"
                placeholder="Artist, song, album, playlist, or mood"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <button type="submit" className="spotify-search-btn" disabled={busy}>
                {busy ? "..." : "Find"}
              </button>
            </form>
          </div>

          {selectedItem && embedUrl ? (
            <div ref={playerShellRef} className="spotify-section-shell spotify-player-shell">
              <div className="spotify-mini-label">Player</div>
              <div className="spotify-embed-wrap">
                <iframe
                  title={`Spotify embed for ${selectedItem.name}`}
                  src={embedUrl}
                  width="100%"
                  height="152"
                  allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                  loading="lazy"
                  className="spotify-embed-frame"
                />
                {selectedItem.spotifyUrl ? (
                  <a
                    className="spotify-open-link"
                    href={selectedItem.spotifyUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open in Spotify
                  </a>
                ) : null}
              </div>
            </div>
          ) : null}

          {results.length ? (
            <div className="spotify-section-shell">
              <div className="spotify-mini-label">Results</div>
              <div className="spotify-results">
                {results.map((result) => (
                  <button
                    key={`${result.type}-${result.id}`}
                    type="button"
                    className={`spotify-result-item ${
                      selectedItem?.id === result.id && selectedItem?.type === result.type
                        ? "is-selected"
                        : ""
                    }`}
                    onClick={() => handleSelectItem(result)}
                  >
                    {result.imageUrl ? (
                      <img src={result.imageUrl} alt="" className="spotify-result-art" />
                    ) : (
                      <div className="spotify-result-art spotify-result-art-placeholder" />
                    )}
                    <span>
                      <div className="spotify-type-badge">{formatTypeLabel(result.type)}</div>
                      <strong>{result.name}</strong>
                      <small>{getItemSubtitle(result)}</small>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="spotify-footnote">
            Spotify embeds work for songs, albums, and playlists, and you can always jump into the full Spotify app from here.
          </div>
        </>
      ) : (
        <>
          <div className="spotify-setup-note">
            Connect Spotify to search songs, albums, and playlists without leaving DayLy.
          </div>
          <button
            type="button"
            className="sidebar-btn primary spotify-connect-btn"
            onClick={handleConnect}
            disabled={busy}
          >
            {busy ? "Redirecting..." : "Connect Spotify"}
          </button>
          <div className="spotify-footnote">
            Redirect URI: <code>{config.redirectUri || "Not available"}</code>
          </div>
        </>
      )}
    </section>
  );
}
