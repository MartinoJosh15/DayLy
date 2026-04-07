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

let spotifyIframeApiPromise = null;

function loadSpotifyIframeApi() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Spotify embed API only loads in the browser."));
  }

  if (window.SpotifyIframeApi) {
    return Promise.resolve(window.SpotifyIframeApi);
  }

  if (spotifyIframeApiPromise) {
    return spotifyIframeApiPromise;
  }

  spotifyIframeApiPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src="https://open.spotify.com/embed/iframe-api/v1"]');

    window.onSpotifyIframeApiReady = (IFrameAPI) => {
      window.SpotifyIframeApi = IFrameAPI;
      resolve(IFrameAPI);
    };

    if (existing) {
      return;
    }

    const script = document.createElement("script");
    script.src = "https://open.spotify.com/embed/iframe-api/v1";
    script.async = true;
    script.onerror = () => reject(new Error("Spotify embed API failed to load."));
    document.body.appendChild(script);
  });

  return spotifyIframeApiPromise;
}

function getSpotifyUri(item) {
  if (!item?.id || !item?.type) return "";
  return `spotify:${item.type}:${item.id}`;
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
  if (!item?.id) return null;

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
  if (!item?.id) return null;

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
  if (!item?.id) return null;

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
  const embedHostRef = useRef(null);
  const embedControllerRef = useRef(null);
  const [spotifySession, setSpotifySession] = useState(() => getStoredSpotifySession());
  const [busy, setBusy] = useState(false);
  const [playerBusy, setPlayerBusy] = useState(false);
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

  useEffect(() => {
    if (!selectedItem || !embedHostRef.current) return undefined;

    let cancelled = false;

    async function mountEmbed() {
      setPlayerBusy(true);

      try {
        const IFrameAPI = await loadSpotifyIframeApi();
        if (cancelled || !embedHostRef.current) return;

        const uri = getSpotifyUri(selectedItem);
        const host = embedHostRef.current;

        if (embedControllerRef.current) {
          try {
            embedControllerRef.current.loadUri(uri);
            embedControllerRef.current.play();
            setStatus(`Loaded ${selectedItem.name} into the embedded player.`);
            return;
          } catch (error) {
            console.error(error);
            try {
              embedControllerRef.current.destroy();
            } catch {}
            embedControllerRef.current = null;
            host.innerHTML = "";
          }
        }

        host.innerHTML = "";

        IFrameAPI.createController(
          host,
          {
            width: "100%",
            height: 176,
            uri,
          },
          (EmbedController) => {
            if (cancelled) {
              try {
                EmbedController.destroy();
              } catch {}
              return;
            }

            embedControllerRef.current = EmbedController;

            try {
              EmbedController.addListener("ready", () => {
                if (cancelled) return;
                try {
                  EmbedController.play();
                } catch (error) {
                  console.error(error);
                }
              });
            } catch {}

            try {
              EmbedController.play();
            } catch (error) {
              console.error(error);
            }
          }
        );

        setStatus(`Loaded ${selectedItem.name} into the embedded player.`);
      } catch (error) {
        if (cancelled) return;
        const message =
          error instanceof Error ? error.message : "Spotify embedded player could not load.";
        setStatus(message);
        toast.error(message);
      } finally {
        if (!cancelled) {
          setPlayerBusy(false);
        }
      }
    }

    mountEmbed();

    return () => {
      cancelled = true;
    };
  }, [selectedItem]);

  useEffect(() => {
    return () => {
      if (embedControllerRef.current) {
        try {
          embedControllerRef.current.destroy();
        } catch {}
        embedControllerRef.current = null;
      }
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
    if (embedControllerRef.current) {
      try {
        embedControllerRef.current.destroy();
      } catch {}
      embedControllerRef.current = null;
    }
    if (embedHostRef.current) {
      embedHostRef.current.innerHTML = "";
    }
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
        ].filter(Boolean);

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
    if (!item?.id || !item?.type) {
      setStatus("That Spotify result could not be opened. Try another one.");
      return;
    }

    setSelectedItem(item);
    setStatus(`Loaded ${item.name} ${item.type === "track" ? "in" : "into"} the embedded player.`);
  }

  const isConfigured = Boolean(config.clientId);
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

          {selectedItem ? (
            <div ref={playerShellRef} className="spotify-section-shell spotify-player-shell">
              <div className="spotify-mini-label">Player</div>
              <div className="spotify-embed-wrap">
                <div ref={embedHostRef} className="spotify-embed-frame" />
                {playerBusy ? <div className="spotify-embed-loading">Loading player...</div> : null}
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
