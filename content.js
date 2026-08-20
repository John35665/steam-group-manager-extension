console.log(
  "[Steam Group Manager] CONTENT.JS LOADED:",
  window.location.href
);

(() => {
  if (window.top !== window) return;

  const STEAM = 'https://steamcommunity.com';
  const PAGE_SOURCES = new Set(['steam-group-manager-page']);
  const STORAGE_KEY = 'steamGroupManagerRosterV1';
  const UI_ID = 'steam-group-manager-ui';

  // Fixed delay between Steam requests.
  const REQUEST_DELAY = 400;

  const storageGet = (key) =>
    chrome.storage.local.get(key).then(r => r?.[key]);

  const storageSet = (value) =>
    chrome.storage.local.set({
      [STORAGE_KEY]: value
    });

  function validSteamId(id) {
    return /^\d{10,20}$/.test(
      String(id || '').trim()
    );
  }

  function cleanName(v) {
    return String(v ?? '')
      .trim()
      .slice(0, 32);
  }

  function normalizeRoster(raw) {
    const members =
      Array.isArray(raw?.members)
        ? raw.members
        : [];

    const map = new Map();

    for (const m of members) {
      const steamId =
        String(m?.steamId || '').trim();

      if (!validSteamId(steamId)) {
        continue;
      }

      const nickname =
        cleanName(m?.nickname);

      if (!nickname) {
        continue;
      }

      map.set(
        steamId,
        {
          steamId,

          nickname,

          displayName:
            String(
              m?.displayName ||
              m?.steamName ||
              ''
            )
              .trim()
              .slice(0, 100),

          updatedAt:
            new Date().toISOString()
        }
      );
    }

    return {
      groupId:
        String(
          raw?.groupId || ''
        ).trim(),

      groupName:
        String(
          raw?.groupName || ''
        ).trim(),

      updatedAt:
        new Date().toISOString(),

      members:
        [...map.values()]
    };
  }

  async function mergeRoster(incoming) {
    const old =
      await storageGet(
        STORAGE_KEY
      ) || {
        members: []
      };

    const merged =
      new Map(
        (old.members || [])
          .filter(
            m =>
              validSteamId(
                m.steamId
              )
          )
          .map(
            m => [
              m.steamId,
              m
            ]
          )
      );

    for (
      const m of incoming.members
    ) {

      merged.set(
        m.steamId,
        {
          ...merged.get(
            m.steamId
          ),

          ...m
        }
      );

    }

    const result = {

      groupId:
        incoming.groupId ||
        old.groupId ||
        '',

      groupName:
        incoming.groupName ||
        old.groupName ||
        '',

      updatedAt:
        new Date().toISOString(),

      members:
        [...merged.values()]

    };

    await storageSet(
      result
    );

    return result;
  }

  function post(
    action,
    data = {}
  ) {

    window.postMessage(
      {
        source:
          'steam-group-manager-extension',

        action,

        ...data
      },
      window.location.origin
    );

  }

  async function receivePageMessages() {

    window.addEventListener(
      'message',
      async event => {

        console.log(
          '[Steam Group Manager] Page message received:',
          event.data
        );

        if (
          event.source !== window ||
          !event.data ||
          !PAGE_SOURCES.has(
            event.data.source
          )
        ) {
          return;
        }

        if (
          event.data.action ===
          'ping'
        ) {

          post(
            'pong',
            {
              ok: true,

              version:
                chrome.runtime
                  .getManifest()
                  .version
            }
          );

          return;
        }

        if (
          event.data.action ===
          'sync-members'
        ) {

          try {

            const roster =
              await mergeRoster(
                normalizeRoster(
                  event.data.payload
                )
              );


            /* =====================================================
               NEW:
               Tell background.js to open Steam after the roster
               has successfully been saved.
            ===================================================== */

            chrome.runtime.sendMessage(
              {
                action:
                  'open-steam'
              },

              function(response) {

                if (
                  chrome.runtime.lastError
                ) {

                  console.error(
                    '[Steam Group Manager] Unable to contact background service worker:',
                    chrome.runtime.lastError.message
                  );

                  return;
                }

                console.log(
                  '[Steam Group Manager] Steam open request sent:',
                  response
                );

              }
            );


            post(
              'sync-result',
              {
                ok: true,

                count:
                  roster.members.length,

                groupName:
                  roster.groupName
              }
            );

          }

          catch (e) {

            post(
              'sync-result',
              {
                ok: false,

                error:
                  e.message ||
                  'Unable to sync members.'
              }
            );

          }

        }

        if (
          event.data.action ===
          'get-roster'
        ) {

          post(
            'roster',
            {
              ok: true,

              roster:
                await storageGet(
                  STORAGE_KEY
                ) || {
                  members: []
                }
            }
          );

        }

      }
    );

  }

  function escapeHtml(v) {

    return String(v ?? '')

      .replaceAll(
        '&',
        '&amp;'
      )

      .replaceAll(
        '<',
        '&lt;'
      )

      .replaceAll(
        '>',
        '&gt;'
      )

      .replaceAll(
        '"',
        '&quot;'
      )

      .replaceAll(
        "'",
        '&#39;'
      );

  }

  function styles() {

    return `
      #${UI_ID}{
        position:fixed;
        right:20px;
        bottom:20px;
        width:390px;
        z-index:2147483647;
        font-family:Arial,sans-serif;
        color:#e8edf5;
        background:#171a21;
        border:1px solid #3b414c;
        border-radius:14px;
        box-shadow:0 18px 60px rgba(0,0,0,.5);
        overflow:hidden
      }

      #${UI_ID} *{
        box-sizing:border-box
      }

      #${UI_ID} .sgm-head{
        padding:15px 17px;
        background:#20242d;
        border-bottom:1px solid #343945
      }

      #${UI_ID} .sgm-title{
        font-size:17px;
        font-weight:700
      }

      #${UI_ID} .sgm-sub{
        font-size:12px;
        color:#9da6b5;
        margin-top:4px
      }

      #${UI_ID} .sgm-body{
        padding:15px 17px
      }

      #${UI_ID} .sgm-stat{
        display:flex;
        justify-content:space-between;
        padding:10px 12px;
        background:#111318;
        border-radius:9px;
        margin-bottom:10px;
        font-size:13px
      }

      #${UI_ID} .sgm-actions{
        display:grid;
        grid-template-columns:1fr 1fr;
        gap:8px
      }

      #${UI_ID} .sgm-btn{
        border:0;
        border-radius:8px;
        padding:10px;
        font-weight:700;
        cursor:pointer;
        background:#3b82f6;
        color:white
      }

      #${UI_ID} .sgm-btn.secondary{
        background:#303640
      }

      #${UI_ID} .sgm-btn:disabled{
        opacity:.45;
        cursor:not-allowed
      }

      #${UI_ID} .sgm-status{
        margin-top:12px;
        padding:10px 12px;
        background:#111318;
        border-radius:9px;
        font-size:12px;
        line-height:1.45;
        max-height:120px;
        overflow:auto
      }

      #${UI_ID} .sgm-ok{
        color:#7ee2a8
      }

      #${UI_ID} .sgm-bad{
        color:#ff8e8e
      }

      #${UI_ID} .sgm-list{
        margin:10px 0 0;
        padding:0;
        list-style:none;
        max-height:150px;
        overflow:auto
      }

      #${UI_ID} .sgm-list li{
        padding:7px 0;
        border-bottom:1px solid #2a2e36;
        font-size:12px;
        display:flex;
        justify-content:space-between;
        gap:8px
      }

      #${UI_ID} .sgm-nick{
        color:#b9c7da;
        text-align:right
      }
    `;

  }

  function setStatus(
    text,
    cls = ''
  ) {

    const n =
      document.querySelector(
        `#${UI_ID} .sgm-status`
      );

    if (n) {

      n.innerHTML =
        `<span class="${cls}">${escapeHtml(text)}</span>`;

    }

  }

  async function sessionValues() {

    const response =
      await new Promise(resolve => {

        chrome.runtime.sendMessage(
          {
            action: 'get-steam-cookies'
          },
          resolve
        );

      });

    if (chrome.runtime.lastError) {

      throw new Error(
        'Unable to contact background.js: ' +
        chrome.runtime.lastError.message
      );

    }

    if (!response?.ok) {

      throw new Error(
        response?.error ||
        'Unable to retrieve Steam cookies.'
      );

    }

    const sessionID =
      String(
        response.sessionid || ''
      ).trim();

    if (!sessionID) {

      throw new Error(
        'Steam sessionid cookie was not found. Make sure you are logged into Steam.'
      );

    }

    const steamId =
      String(
        window.g_steamID ||
        window.g_rgProfileData?.steamid ||
        ''
      ).trim();

    return {
      sessionID,
      steamId
    };

  }

  /*
   * Wait exactly 400 ms between requests.
   */
  async function requestDelay() {

    await new Promise(
      resolve =>
        setTimeout(
          resolve,
          REQUEST_DELAY
        )
    );

  }

  /* =====================================================
     SEND FRIEND REQUESTS
  ===================================================== */

  async function sendFriendRequests(
    roster,
    status
  ) {

    const {
      sessionID
    } =
      await sessionValues();

    let sent = 0;
    let failed = 0;

    for (
      let i = 0;
      i < roster.members.length;
      i++
    ) {

      const m =
        roster.members[i];

      status(
        `Friend requests: ${i + 1}/${roster.members.length} — ${m.displayName || m.steamId}`
      );

      try {

        const r =
          await fetch(
            `${STEAM}/actions/AddFriendAjax`,
            {
              method:
                'POST',

              credentials:
                'include',

              headers: {
                'Content-Type':
                  'application/x-www-form-urlencoded; charset=UTF-8'
              },

              body:
                new URLSearchParams({
                  steamid:
                    m.steamId,

                  sessionID
                })
            }
          );

        if (!r.ok) {

          throw new Error(
            `HTTP ${r.status}`
          );

        }

        sent++;

      }

      catch (e) {

        failed++;

      }

      await requestDelay();

    }

    return {
      sent,
      failed
    };

  }

  /* =====================================================
     GET FRIEND IDS
  ===================================================== */

  async function getFriendSteamIds() {

    const r =
      await fetch(
        `${STEAM}/my/friends`,
        {
          credentials:
            'include'
        }
      );

    if (!r.ok) {

      throw new Error(
        `Unable to load Steam friends list (HTTP ${r.status}).`
      );

    }

    const html =
      await r.text();

    const ids =
      new Set();

    /*
     * Steam commonly exposes the full SteamID64 as
     * data-steamid="7656119...".
     *
     * Some markup can also use data-steam-id.
     */
    for (
      const m of html.matchAll(
        /data-steam(?:-)?id=["'](\d{16,20})["']/gi
      )
    ) {

      ids.add(
        m[1]
      );

    }

    /*
     * /profiles/<SteamID64> URLs already contain the
     * full 64-bit Steam ID.
     */
    for (
      const m of html.matchAll(
        /\/profiles\/(\d{16,20})(?:[\/"'?#]|$)/gi
      )
    ) {

      ids.add(
        m[1]
      );

    }

    /*
     * data-miniprofile is normally Steam's 32-bit
     * account ID, NOT a SteamID64.
     *
     * Convert it using:
     *
     * SteamID64 =
     * 76561197960265728 + accountID
     */
    const STEAM_ID64_BASE =
      76561197960265728n;

    for (
      const m of html.matchAll(
        /data-miniprofile=["'](\d{1,12})["']/gi
      )
    ) {

      try {

        const accountId =
          BigInt(
            m[1]
          );

        if (
          accountId <= 0n
        ) {
          continue;
        }

        const steamId64 =
          (
            STEAM_ID64_BASE +
            accountId
          ).toString();

        if (
          validSteamId(
            steamId64
          )
        ) {

          ids.add(
            steamId64
          );

        }

      }

      catch (e) {

        // Ignore malformed miniprofile values.

      }

    }

    console.log(
      '[Steam Group Manager] Friend Steam IDs found:',
      ids.size
    );

    return [
      ...ids
    ];

  }

  /* =====================================================
     CLEAR FRIEND NICKNAMES
  ===================================================== */

  async function clearFriendNicknames(
    status
  ) {

    const {
      sessionID
    } =
      await sessionValues();

    const friendIds =
      await getFriendSteamIds();

    let ok = 0;
    let failed = 0;

    for (
      let i = 0;
      i < friendIds.length;
      i++
    ) {

      const steamId =
        friendIds[i];

      status(
        `Clearing friend nicknames: ${i + 1}/${friendIds.length}`
      );

      try {

        const r =
          await fetch(
            `${STEAM}/profiles/${encodeURIComponent(steamId)}/ajaxsetnickname/`,
            {
              method:
                'POST',

              credentials:
                'include',

              headers: {
                'Content-Type':
                  'application/x-www-form-urlencoded; charset=UTF-8'
              },

              body:
                new URLSearchParams({
                  nickname:
                    '',

                  sessionid:
                    sessionID
                })
            }
          );

        if (!r.ok) {

          throw new Error(
            `HTTP ${r.status}`
          );

        }

        ok++;

      }

      catch (e) {

        failed++;

      }

      await requestDelay();

    }

    return {
      total:
        friendIds.length,

      ok,
      failed
    };

  }

  /* =====================================================
     APPLY NICKNAMES
  ===================================================== */

  async function applyNicknames(
    roster,
    status
  ) {

    /*
     * First clear all existing Steam friend
     * nicknames.
     */

    const cleared =
      await clearFriendNicknames(
        status
      );

    const {
      sessionID
    } =
      await sessionValues();

    let ok = 0;
    let failed = 0;

    for (
      let i = 0;
      i < roster.members.length;
      i++
    ) {

      const m =
        roster.members[i];

      status(
        `Nicknames: ${i + 1}/${roster.members.length} — ${m.nickname} ${m.displayName}`
      );

      try {

        const r =
          await fetch(
            `${STEAM}/profiles/${encodeURIComponent(m.steamId)}/ajaxsetnickname/`,
            {
              method:
                'POST',

              credentials:
                'include',

              headers: {
                'Content-Type':
                  'application/x-www-form-urlencoded; charset=UTF-8'
              },

              body:
                new URLSearchParams({
                  nickname:
                    `${m.nickname} ${m.displayName}`.slice(0,32),

                  sessionid:
                    sessionID
                })
            }
          );

        if (!r.ok) {

          throw new Error(
            `HTTP ${r.status}`
          );

        }

        ok++;

      }

      catch (e) {

        failed++;

      }

      await requestDelay();

    }

    return {
      ok,
      failed,
      cleared
    };

  }

  /* =====================================================
     RENDER STEAM UI
  ===================================================== */

  async function renderSteamUI() {

    const roster =
      await storageGet(
        STORAGE_KEY
      );

    if (
      !roster?.members?.length ||
      document.getElementById(
        UI_ID
      )
    ) {

      return;

    }

    const root =
      document.createElement(
        'div'
      );

    root.id =
      UI_ID;

    root.innerHTML = `
      <style>
        ${styles()}
      </style>

      <div class="sgm-head">

        <div class="sgm-title">
          Steam Group Manager
        </div>

        <div class="sgm-sub">
          ${escapeHtml(
            roster.groupName ||
            'Stored group'
          )}
        </div>

      </div>

      <div class="sgm-body">

        <div class="sgm-stat">

          <span>
            Members
          </span>

          <strong>
            ${roster.members.length}
          </strong>

        </div>

        <div class="sgm-actions">

          <button
            id="sgm-friends"
            class="sgm-btn">

            Send Friend Requests

          </button>

          <button
            id="sgm-nicks"
            class="sgm-btn">

            Clear Friends + Apply Nicknames

          </button>

        </div>

        <div class="sgm-status">

          Ready. You can send requests now
          and apply nicknames later.

        </div>

        <ul class="sgm-list">

          ${roster.members
            .slice(0, 25)
            .map(
              m => `
                <li>

                  <span>
                    ${escapeHtml(
                      m.displayName ||
                      m.steamId
                    )}
                  </span>

                  <span class="sgm-nick">
                  ${escapeHtml(
                     `${m.nickname} ${m.displayName}`.slice(0,32)
                  )}
                  </span>

                </li>
              `
            )
            .join('')}

        </ul>

      </div>
    `;

    document.documentElement.appendChild(
      root
    );

    const status =
      (text, cls = '') =>
        setStatus(
          text,
          cls
        );

    const fb =
      root.querySelector(
        '#sgm-friends'
      );

    const nb =
      root.querySelector(
        '#sgm-nicks'
      );

    fb.onclick =
      async () => {

        fb.disabled =
          true;

        nb.disabled =
          true;

        try {

          const r =
            await sendFriendRequests(
              roster,
              status
            );

          status(
            `Friend-request run complete. ${r.sent} accepted by Steam's endpoint, ${r.failed} failed. You can run this again safely when new members are added.`,
            r.failed
              ? 'sgm-bad'
              : 'sgm-ok'
          );

        }

        catch (e) {

          status(
            e.message,
            'sgm-bad'
          );

        }

        finally {

          fb.disabled =
            false;

          nb.disabled =
            false;

        }

      };

    nb.onclick =
      async () => {

        fb.disabled =
          true;

        nb.disabled =
          true;

        try {

          const r =
            await applyNicknames(
              roster,
              status
            );

          status(
            `Nickname run complete. Cleared ${r.cleared.ok}/${r.cleared.total} friend nicknames, then updated ${r.ok} group nicknames; ${r.failed} group updates failed. Run it again later to catch new members.`,
            r.failed
              ? 'sgm-bad'
              : 'sgm-ok'
          );

        }

        catch (e) {

          status(
            e.message,
            'sgm-bad'
          );

        }

        finally {

          fb.disabled =
            false;

          nb.disabled =
            false;

        }

      };

  }

  /* =====================================================
     START
  ===================================================== */

  if (
    location.origin ===
    STEAM
  ) {

    renderSteamUI()
      .catch(
        console.error
      );

  }

  else {

    receivePageMessages();

  }

})();
