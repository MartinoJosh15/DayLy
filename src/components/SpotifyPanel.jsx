import { useEffect, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import {
  beginSpotifyLogin,
  clearSpotifySession,
  ensureSpotifySession,
  getSpotifyConfig,
  getStoredSpotifySession,
  loadSpotifySdk,
  maybeCompleteSpotifyLogin,
  spotifyApiFetch,
} from "../utils/spotify";

const EMPTY_PLAYBACK = {
  isPlaying: false,
  currentTrack: null,
  deviceId: "",
  deviceReady: false,
  accountName: "",
};

function delay(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export default function SpotifyPanel() {
  const config = getSpotifyConfig();
  const playerRef = useRef(null);
  const playbackRef = useRef(EMPTY_PLAYBACK);
  const [spotifySession, setSpotifySession] = useState(() => getStoredSpotifySession());
  const [busy, setBusy] = useState(false);
  const [loadingSdk, setLoadingSdk] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [playback, setPlayback] = useState(EMPTY_PLAYBACK);
  const [status, setStatus] = useState("Connect Spotify to bring music into your workspace.");
  const [hasPremiumWarning, setHasPremiumWarning] = useState(false);

  useEffect(() => {
    playbackRef.current = playback;
  }, [playback]);

  useEffect(() => {
    let mounted = true;

    maybeCompleteSpotifyLogin()
      .then((session) => {
        if (!mounted || !session) return;
        setSpotifySession(session);
        setStatus("Spotify connected. Loading your workspace player...");
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
    if (!spotifySession) {
      setPlayback(EMPTY_PLAYBACK);
      return undefined;
    }

    let cancelled = false;
    let refreshTimer;

    async function bootstrapPlayer() {
      setLoadingSdk(true);

      try {
        const activeSession = await ensureSpotifySession(spotifySession);
        if (cancelled || !activeSession) return;
        if (activeSession !== spotifySession) {
          setSpotifySession(activeSession);
        }

        const profile = await spotifyApiFetch("/me", activeSession.accessToken);
        if (cancelled) return;

        setPlayback((prev) => ({
          ...prev,
          accountName: profile.display_name || profile.id || "",
        }));

        const Spotify = await loadSpotifySdk();
        if (cancelled) return;

        const player = new Spotify.Player({
          name: "DayLy Workspace Player",
          getOAuthToken: async (callback) => {
            try {
              const freshSession = await ensureSpotifySession(
                getStoredSpotifySession() || activeSession
              );
              if (freshSession) {
                setSpotifySession(freshSession);
                callback(freshSession.accessToken);
              }
            } catch (error) {
              console.error(error);
            }
          },
          volume: 0.7,
        });

        playerRef.current = player;

        player.addListener("ready", async ({ device_id: deviceId }) => {
          if (cancelled) return;

          setPlayback((prev) => {
            const next = {
              ...prev,
              deviceId,
              deviceReady: true,
            };
            playbackRef.current = next;
            return next;
          });
          setStatus("Spotify player ready. Pick a track and it will play here.");

          try {
            const freshSession = await ensureSpotifySession(getStoredSpotifySession() || activeSession);
            if (!freshSession) return;
            setSpotifySession(freshSession);
            await spotifyApiFetch("/me/player", freshSession.accessToken, {
              method: "PUT",
              body: JSON.stringify({
                device_ids: [deviceId],
                play: false,
              }),
            });
          } catch (error) {
            console.error(error);
          }
        });

        player.addListener("not_ready", () => {
          if (cancelled) return;
          setPlayback((prev) => {
            const next = {
              ...prev,
              deviceReady: false,
            };
            playbackRef.current = next;
            return next;
          });
        });

        player.addListener("initialization_error", ({ message }) => {
          if (cancelled) return;
          setStatus(message || "Spotify player failed to initialize.");
        });

        player.addListener("authentication_error", ({ message }) => {
          if (cancelled) return;
          setStatus(message || "Spotify authentication expired.");
        });

        player.addListener("account_error", ({ message }) => {
          if (cancelled) return;
          setHasPremiumWarning(true);
          setStatus(message || "Spotify Premium is required for browser playback.");
        });

        player.addListener("autoplay_failed", () => {
          if (cancelled) return;
          setStatus("Browser playback needs one direct click first. Press Play or select the track again.");
        });

        player.addListener("playback_error", ({ message }) => {
          if (cancelled) return;
          setStatus(message || "Spotify could not start playback in the browser.");
        });

        player.addListener("player_state_changed", (state) => {
          if (cancelled || !state) return;

          const current = state.track_window.current_track;
          setPlayback((prev) => {
            const next = {
              ...prev,
              isPlaying: !state.paused,
              currentTrack: current
                ? {
                    id: current.id,
                    name: current.name,
                    artists: current.artists?.map((artist) => artist.name).join(", ") || "",
                    album: current.album?.name || "",
                    imageUrl: current.album?.images?.[0]?.url || "",
                    uri: current.uri,
                  }
                : null,
            };
            playbackRef.current = next;
            return next;
          });
        });

        const connected = await player.connect();
        if (!connected && !cancelled) {
          setStatus("Spotify player connection was rejected. Check your Spotify app settings.");
        }
      } catch (error) {
        if (cancelled) return;
        setStatus(error instanceof Error ? error.message : "Spotify failed to start.");
      } finally {
        if (!cancelled) {
          setLoadingSdk(false);
        }
      }
    }

    bootstrapPlayer();

    if (spotifySession?.expiresAt) {
      const msUntilRefresh = Math.max(spotifySession.expiresAt - Date.now() - 30_000, 5_000);
      refreshTimer = window.setTimeout(async () => {
        try {
          const refreshed = await ensureSpotifySession(getStoredSpotifySession());
          if (cancelled || !refreshed) return;
          setSpotifySession(refreshed);
        } catch (error) {
          console.error(error);
        }
      }, msUntilRefresh);
    }

    return () => {
      cancelled = true;
      if (refreshTimer) {
        window.clearTimeout(refreshTimer);
      }
      if (playerRef.current) {
        playerRef.current.disconnect();
        playerRef.current = null;
      }
    };
  }, [spotifySession]);

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
    if (playerRef.current) {
      playerRef.current.disconnect();
      playerRef.current = null;
    }
    setSpotifySession(null);
    setResults([]);
    setQuery("");
    setHasPremiumWarning(false);
    playbackRef.current = EMPTY_PLAYBACK;
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
          `/search?type=track&limit=5&q=${encodeURIComponent(query.trim())}`,
          session.accessToken
        );

        setResults(
          (data?.tracks?.items || []).map((item) => ({
            id: item.id,
            name: item.name,
            artists: item.artists?.map((artist) => artist.name).join(", ") || "",
            imageUrl: item.album?.images?.[2]?.url || item.album?.images?.[0]?.url || "",
            uri: item.uri,
          }))
        );
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Spotify search failed.");
    } finally {
      setBusy(false);
    }
  }

  async function waitForDeviceReady() {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const currentPlayback = playbackRef.current;
      if (currentPlayback.deviceId && currentPlayback.deviceReady) {
        return currentPlayback.deviceId;
      }
      await delay(500);
    }
    return "";
  }

  async function transferPlaybackToBrowser(session, deviceId) {
    await spotifyApiFetch("/me/player", session.accessToken, {
      method: "PUT",
      body: JSON.stringify({
        device_ids: [deviceId],
        play: false,
      }),
    });

    for (let attempt = 0; attempt < 6; attempt += 1) {
      await delay(350);

      try {
        const devices = await spotifyApiFetch("/me/player/devices", session.accessToken);
        const matchedDevice = (devices?.devices || []).find((device) => device.id === deviceId);
        if (matchedDevice) {
          return true;
        }
      } catch (error) {
        console.error(error);
      }
    }

    return false;
  }

  async function activateBrowserPlayer() {
    if (!playerRef.current?.activateElement) return;

    try {
      await playerRef.current.activateElement();
    } catch (error) {
      console.error(error);
    }
  }

  async function playTrack(uri) {
    setBusy(true);
    setStatus("Getting your Spotify browser player ready...");

    try {
      await activateBrowserPlayer();

      await withSpotifySession(async (session) => {
        const deviceId = await waitForDeviceReady();

        if (!deviceId) {
          throw new Error("Spotify player is still waking up. Try again in a moment.");
        }

        setStatus("Activating your browser as the Spotify playback device...");
        await transferPlaybackToBrowser(session, deviceId);

        let lastError = null;
        for (let attempt = 0; attempt < 3; attempt += 1) {
          try {
            if (attempt > 0) {
              setStatus("Retrying playback on your browser device...");
              await delay(900);
            }

            await spotifyApiFetch(
              "/me/player/play?device_id=" + encodeURIComponent(deviceId),
              session.accessToken,
              {
                method: "PUT",
                body: JSON.stringify({ uris: [uri] }),
              }
            );
            setStatus("Now playing in your DayLy workspace.");
            return;
          } catch (error) {
            lastError = error;
            const message = error instanceof Error ? error.message : "Could not start playback.";

            if (/device not found/i.test(message)) {
              await transferPlaybackToBrowser(session, deviceId);
              continue;
            }

            throw error;
          }
        }

        throw lastError || new Error("Could not start playback.");
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not start playback.";
      if (/device not found/i.test(message)) {
        setStatus("Spotify is still registering this browser as a playback device. Try again in a few seconds.");
        toast.error("Spotify browser device is still registering. Try again in a few seconds.");
      } else {
        setStatus(message);
        toast.error(message);
      }
    } finally {
      setBusy(false);
    }
  }

  async function togglePlayback() {
    if (!playerRef.current) {
      toast.error("Spotify player is not ready yet.");
      return;
    }

    try {
      await activateBrowserPlayer();
      await playerRef.current.togglePlay();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not change playback.");
    }
  }

  async function skip(direction) {
    if (!playerRef.current) {
      toast.error("Spotify player is not ready yet.");
      return;
    }

    try {
      await activateBrowserPlayer();
      if (direction === "next") {
        await playerRef.current.nextTrack();
      } else {
        await playerRef.current.previousTrack();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not skip the track.");
    }
  }

  const isConfigured = Boolean(config.clientId);
  const currentTrack = playback.currentTrack;

  return (
    <section className="spotify-panel">
      <div className="spotify-panel-header">
        <div>
          <div className="sidebar-section-label spotify-section-label">Spotify Workspace</div>
          <div className="spotify-panel-title">Focus soundtrack</div>
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
              <span className={`spotify-dot ${playback.deviceReady ? "ready" : ""}`} />
              <span>{status}</span>
            </div>
            {playback.accountName ? (
              <div className="spotify-account-name">Signed in as {playback.accountName}</div>
            ) : null}
          </div>

          {currentTrack ? (
            <div className="spotify-now-playing">
              {currentTrack.imageUrl ? (
                <img src={currentTrack.imageUrl} alt={currentTrack.name} className="spotify-artwork" />
              ) : (
                <div className="spotify-artwork spotify-artwork-placeholder">♪</div>
              )}
              <div className="spotify-track-meta">
                <strong>{currentTrack.name}</strong>
                <span>{currentTrack.artists}</span>
                <small>{currentTrack.album}</small>
              </div>
            </div>
          ) : (
            <div className="spotify-empty-state">Search for a song or playlist starter and play it here.</div>
          )}

          <div className="spotify-controls">
            <button type="button" className="spotify-control-btn" onClick={() => skip("previous")}>
              Prev
            </button>
            <button type="button" className="spotify-control-btn primary" onClick={togglePlayback}>
              {playback.isPlaying ? "Pause" : "Play"}
            </button>
            <button type="button" className="spotify-control-btn" onClick={() => skip("next")}>
              Next
            </button>
          </div>

          <form className="spotify-search-form" onSubmit={handleSearch}>
            <input
              className="spotify-search-input"
              placeholder="Search Spotify"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <button type="submit" className="spotify-search-btn" disabled={busy}>
              {busy ? "..." : "Find"}
            </button>
          </form>

          {results.length ? (
            <div className="spotify-results">
              {results.map((result) => (
                <button
                  key={result.id}
                  type="button"
                  className="spotify-result-item"
                  onClick={() => playTrack(result.uri)}
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
          ) : null}

          {loadingSdk ? <div className="spotify-footnote">Preparing the web player...</div> : null}
          {hasPremiumWarning ? (
            <div className="spotify-footnote">
              Browser playback needs Spotify Premium. The connection can still succeed without it.
            </div>
          ) : null}
        </>
      ) : (
        <>
          <div className="spotify-setup-note">
            Connect your Spotify Premium account to play music without leaving DayLy.
          </div>
          <button type="button" className="sidebar-btn primary spotify-connect-btn" onClick={handleConnect} disabled={busy}>
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
