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

function getEmbedUrl(trackId) {
  if (!trackId) return "";
  return `https://open.spotify.com/embed/track/${trackId}?utm_source=generator&theme=0`;
}

export default function SpotifyPanel() {
  const config = getSpotifyConfig();
  const playerShellRef = useRef(null);
  const [spotifySession, setSpotifySession] = useState(() => getStoredSpotifySession());
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [selectedTrack, setSelectedTrack] = useState(null);
  const [status, setStatus] = useState("Connect Spotify to search and play tracks inside your workspace.");

  useEffect(() => {
    let mounted = true;

    maybeCompleteSpotifyLogin()
      .then((session) => {
        if (!mounted || !session) return;
        setSpotifySession(session);
        setStatus("Spotify connected. Search for a track and load it in the embedded player.");
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
    setSelectedTrack(null);
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
        const data = await spotifyApiFetch(
          `/search?type=track&limit=6&q=${encodeURIComponent(query.trim())}`,
          session.accessToken
        );

        const mappedResults = (data?.tracks?.items || []).map((item) => ({
          id: item.id,
          name: item.name,
          artists: item.artists?.map((artist) => artist.name).join(", ") || "",
          album: item.album?.name || "",
          imageUrl: item.album?.images?.[2]?.url || item.album?.images?.[0]?.url || "",
          spotifyUrl: item.external_urls?.spotify || "",
        }));

        setResults(mappedResults);
        if (mappedResults.length) {
          setStatus("Pick a result to load it into the Spotify embed player.");
        } else {
          setStatus("No Spotify tracks matched that search.");
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

  function handleSelectTrack(track) {
    setSelectedTrack(track);
    setStatus(`Loaded ${track.name} in the embedded player.`);
  }

  useEffect(() => {
    if (!selectedTrack || !playerShellRef.current) return;

    playerShellRef.current.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }, [selectedTrack]);

  const isConfigured = Boolean(config.clientId);

  return (
    <section className="spotify-panel">
      <div className="spotify-panel-header">
        <div className="spotify-panel-heading">
          <div className="sidebar-section-label spotify-section-label">Spotify Workspace</div>
          <div className="spotify-panel-title">Focus soundtrack</div>
          <div className="spotify-panel-copy">Search a track and keep it playing beside your planner.</div>
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

          {selectedTrack ? (
            <div className="spotify-now-playing spotify-now-playing-selected">
              {selectedTrack.imageUrl ? (
                <img src={selectedTrack.imageUrl} alt={selectedTrack.name} className="spotify-artwork" />
              ) : (
                <div className="spotify-artwork spotify-artwork-placeholder">S</div>
              )}
              <div className="spotify-track-meta">
                <strong>{selectedTrack.name}</strong>
                <span>{selectedTrack.artists}</span>
                <small>{selectedTrack.album}</small>
              </div>
            </div>
          ) : (
            <div className="spotify-empty-state">Search for a track, then load it in the player below.</div>
          )}

          <div className="spotify-section-shell">
            <div className="spotify-mini-label">Search</div>
            <form className="spotify-search-form" onSubmit={handleSearch}>
              <input
                className="spotify-search-input"
                placeholder="Artist, song, or mood"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <button type="submit" className="spotify-search-btn" disabled={busy}>
                {busy ? "..." : "Find"}
              </button>
            </form>
          </div>

          {selectedTrack ? (
            <div ref={playerShellRef} className="spotify-section-shell spotify-player-shell">
              <div className="spotify-mini-label">Player</div>
              <div className="spotify-embed-wrap">
                <iframe
                  title={`Spotify embed for ${selectedTrack.name}`}
                  src={getEmbedUrl(selectedTrack.id)}
                  width="100%"
                  height="152"
                  allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                  loading="lazy"
                  className="spotify-embed-frame"
                />
                {selectedTrack.spotifyUrl ? (
                  <a
                    className="spotify-open-link"
                    href={selectedTrack.spotifyUrl}
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
                  key={result.id}
                  type="button"
                  className={`spotify-result-item ${
                    selectedTrack?.id === result.id ? "is-selected" : ""
                  }`}
                  onClick={() => handleSelectTrack(result)}
                >
                  {result.imageUrl ? (
                    <img src={result.imageUrl} alt="" className="spotify-result-art" />
                  ) : (
                    <div className="spotify-result-art spotify-result-art-placeholder" />
                  )}
                  <span>
                    <strong>{result.name}</strong>
                    <small>{result.artists}</small>
                  </span>
                </button>
              ))}
              </div>
            </div>
          ) : null}

          <div className="spotify-footnote">
            The embedded player is more reliable than browser-device playback and can open the full track in Spotify when needed.
          </div>
        </>
      ) : (
        <>
          <div className="spotify-setup-note">
            Connect Spotify to search tracks and use the embedded player without leaving DayLy.
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
