const STORAGE_KEY = "arm32.challenge.v1";
const DATA_VERSION = 5;
const CHALLENGE_DAYS = 28;
const SUPABASE_URL = "https://jthnxivlhwuvfebidanu.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_cLuBojdu2XFHAjBhiijAtA_KRWrrxNt";
const LIVE_APP_URL = "https://jonashaas.github.io/arm-challenge/";
const PHOTO_BUCKET = "checkin-photos";
const PUBLIC_SHARE_BUCKET = "progress-shares";
const BACKUP_DB_NAME = "arm32.file-backup";
const BACKUP_STORE_NAME = "handles";
const BACKUP_HANDLE_KEY = "primary";
const MUSCLE_GROUPS = ["Triceps", "Biceps"];
const CHECKIN_DAYS = [1, 7, 14, 21, 28];
const CHECKIN_LABELS = ["Baseline", "Week 1", "Week 2", "Week 3", "Final"];
const DAYS_PER_WEEK = 7;
const CHALLENGE_WEEKS = 4;
const requestedSharePath = new URLSearchParams(location.search).get("share");
const publicSharePath = isValidPublicSharePath(requestedSharePath)
  ? requestedSharePath
  : null;
const isSharedView = requestedSharePath !== null;

const createSet = () => ({
  logged: false,
  reps: 10,
  weight: "",
});

const createGroups = () => ({
  Triceps: Array.from({ length: 5 }, createSet),
  Biceps: Array.from({ length: 5 }, createSet),
});

function createPrefilledGroups(day) {
  const groups = createGroups();
  let previousGroups = null;

  for (let previousDay = day - 1; previousDay >= 1; previousDay -= 1) {
    const previousRecord = state.days[previousDay];
    if (previousRecord?.complete && previousRecord.groups) {
      previousGroups = previousRecord.groups;
      break;
    }
  }

  if (!previousGroups) return groups;

  MUSCLE_GROUPS.forEach((muscle) => {
    groups[muscle] = groups[muscle].map((set, index) => {
      const previousSet = previousGroups[muscle]?.[index];
      if (!previousSet?.logged) return set;
      return {
        logged: false,
        reps: normaliseReps(previousSet.reps),
        weight: previousSet.weight || "",
      };
    });
  });

  return groups;
}

const emptyState = () => ({
  version: DATA_VERSION,
  updatedAt: null,
  startedAt: null,
  days: {},
  checkins: {},
  publicShare: null,
});

let didMigrateOnLoad = false;
let state = isSharedView ? emptyState() : loadState();
let activeDay = 1;
let activeCheckinDay = 1;
let draftGroups = createGroups();
let draftLocation = "gym";
let dayDraftBaseline = null;
let dayClosePending = false;
let draftPhoto = null;
let toastTimer;
let backupHandle = null;
let backupReadyPromise;
let supabaseClient = null;
let cloudUser = null;
let cloudReadyPromise;
let cloudWriteChain = Promise.resolve(false);
let cloudSessionPromise = Promise.resolve();
let lastCloudSynced = false;
let restTimerStartedAt = null;
let restTimerInterval = null;
let restTimerDay = null;
let showAllDays = false;
let syncNudgeShown = hasMeaningfulState(state);

const elements = {
  dayGrid: document.querySelector("#dayGrid"),
  checkinGrid: document.querySelector("#checkinGrid"),
  dayDialog: document.querySelector("#dayDialog"),
  dayDialogTitle: document.querySelector("#dayDialogTitle"),
  dayDialogEyebrow: document.querySelector("#dayDialogEyebrow"),
  dayClosePrompt: document.querySelector("#dayClosePrompt"),
  discardDayChangesButton: document.querySelector("#discardDayChangesButton"),
  saveCurrentDayButton: document.querySelector("#saveCurrentDayButton"),
  keepEditingDayButton: document.querySelector("#keepEditingDayButton"),
  tricepsSetList: document.querySelector("#tricepsSetList"),
  bicepsSetList: document.querySelector("#bicepsSetList"),
  loggedTricepsCount: document.querySelector("#loggedTricepsCount"),
  loggedBicepsCount: document.querySelector("#loggedBicepsCount"),
  loggedRepsCount: document.querySelector("#loggedRepsCount"),
  loggedVolumeCount: document.querySelector("#loggedVolumeCount"),
  daySaveStatus: document.querySelector("#daySaveStatus"),
  restTimer: document.querySelector("#restTimer"),
  restTimerValue: document.querySelector("#restTimerValue"),
  restTimerState: document.querySelector("#restTimerState"),
  cancelRestTimerButton: document.querySelector("#cancelRestTimerButton"),
  trainingLocationButtons: Array.from(
    document.querySelectorAll("[data-training-location]"),
  ),
  tricepsBlockTotal: document.querySelector("#tricepsBlockTotal"),
  bicepsBlockTotal: document.querySelector("#bicepsBlockTotal"),
  completedDays: document.querySelector("#completedDays"),
  progressOrbit: document.querySelector("#progressOrbit"),
  progressBar: document.querySelector("#progressBar"),
  progressBarFill: document.querySelector("#progressBarFill"),
  progressBarLabel: document.querySelector("#progressBarLabel"),
  totalVolume: document.querySelector("#totalVolume"),
  totalSets: document.querySelector("#totalSets"),
  totalReps: document.querySelector("#totalReps"),
  weeklyStatsGrid: document.querySelector("#weeklyStatsGrid"),
  armChange: document.querySelector("#armChange"),
  armChangeUnit: document.querySelector("#armChangeUnit"),
  currentDayStat: document.querySelector("#currentDayStat"),
  challengeDate: document.querySelector("#challengeDate"),
  todayButton: document.querySelector("#todayButton"),
  todayButtonLabel: document.querySelector("#todayButtonLabel"),
  checkinDueButton: document.querySelector("#checkinDueButton"),
  checkinDueButtonLabel: document.querySelector("#checkinDueButtonLabel"),
  mobileWeekLabel: document.querySelector("#mobileWeekLabel"),
  toggleAllDaysButton: document.querySelector("#toggleAllDaysButton"),
  checkinDialog: document.querySelector("#checkinDialog"),
  checkinDialogTitle: document.querySelector("#checkinDialogTitle"),
  leftArmInput: document.querySelector("#leftArmInput"),
  rightArmInput: document.querySelector("#rightArmInput"),
  noteInput: document.querySelector("#noteInput"),
  photoInput: document.querySelector("#photoInput"),
  photoPreview: document.querySelector("#photoPreview"),
  photoPrompt: document.querySelector("#photoPrompt"),
  settingsDialog: document.querySelector("#settingsDialog"),
  syncButton: document.querySelector("#syncButton"),
  syncButtonLabel: document.querySelector("#syncButtonLabel"),
  cloudStatus: document.querySelector("#cloudStatus"),
  cloudStatusText: document.querySelector("#cloudStatusText"),
  cloudAccount: document.querySelector("#cloudAccount"),
  cloudAuthButton: document.querySelector("#cloudAuthButton"),
  shareButton: document.querySelector("#shareButton"),
  sharedBanner: document.querySelector("#sharedBanner"),
  shareStatusText: document.querySelector("#shareStatusText"),
  shareLinkField: document.querySelector("#shareLinkField"),
  shareLinkOutput: document.querySelector("#shareLinkOutput"),
  sharePrimaryButton: document.querySelector("#sharePrimaryButton"),
  shareStopButton: document.querySelector("#shareStopButton"),
  authDialog: document.querySelector("#authDialog"),
  authForm: document.querySelector("#authForm"),
  authEmailInput: document.querySelector("#authEmailInput"),
  authMessage: document.querySelector("#authMessage"),
  sendMagicLinkButton: document.querySelector("#sendMagicLinkButton"),
  backupStatus: document.querySelector("#backupStatus"),
  connectBackupButton: document.querySelector("#connectBackupButton"),
  settingsImportButton: document.querySelector("#settingsImportButton"),
  importInput: document.querySelector("#importInput"),
  toast: document.querySelector("#toast"),
};

function isValidPublicSharePath(value) {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.json$/i.test(value);
}

function normalisePublicShare(value) {
  if (!value?.enabled || !isValidPublicSharePath(value.path)) return null;
  return { enabled: true, path: value.path };
}

function getPublicShareUrl(path = state.publicShare?.path) {
  if (!isValidPublicSharePath(path)) return "";
  const url = new URL(LIVE_APP_URL);
  url.searchParams.set("share", path);
  return url.toString();
}

function renderShareControls() {
  if (isSharedView) return;

  const activeShare = normalisePublicShare(state.publicShare);
  const shareUrl = activeShare ? getPublicShareUrl(activeShare.path) : "";
  elements.shareButton.hidden = !cloudUser && !activeShare;
  elements.shareLinkField.hidden = !activeShare;
  elements.shareLinkOutput.value = shareUrl;

  if (activeShare) {
    elements.shareStatusText.textContent = cloudUser
      ? "Public · read only"
      : "Public · sign in to manage";
    elements.sharePrimaryButton.textContent = "Copy public link";
    elements.shareStopButton.hidden = !cloudUser;
    return;
  }

  elements.shareStatusText.textContent = cloudUser ? "Not shared" : "Sign in first";
  elements.sharePrimaryButton.textContent = cloudUser
    ? "Create public link"
    : "Sign in to create link";
  elements.shareStopButton.hidden = true;
}

function buildPublicSnapshot() {
  const days = Object.fromEntries(
    Object.entries(state.days || {}).map(([day, record]) => [day, {
      groups: Object.fromEntries(
        MUSCLE_GROUPS.map((muscle) => [
          muscle,
          (record.groups?.[muscle] || []).slice(0, 5).map((set) => ({
            logged: Boolean(set.logged),
            reps: normaliseReps(set.reps),
            weight: set.weight === "" ? "" : Number(set.weight),
          })),
        ]),
      ),
      complete: Boolean(record.complete),
      partial: Boolean(record.partial),
      location: ["gym", "home"].includes(record.location) ? record.location : null,
      updatedAt: record.updatedAt || null,
    }]),
  );

  const checkins = Object.fromEntries(
    Object.entries(state.checkins || {}).map(([day, record]) => [day, {
      leftArm: record?.leftArm ?? "",
      rightArm: record?.rightArm ?? "",
      updatedAt: record?.updatedAt || null,
    }]),
  );

  return {
    version: DATA_VERSION,
    updatedAt: state.updatedAt,
    startedAt: state.startedAt,
    days,
    checkins,
  };
}

async function syncPublicShare() {
  const activeShare = normalisePublicShare(state.publicShare);
  if (!cloudUser || !supabaseClient || !activeShare) return true;

  const payload = new Blob([JSON.stringify(buildPublicSnapshot())], {
    type: "application/json",
  });
  const { error } = await supabaseClient.storage
    .from(PUBLIC_SHARE_BUCKET)
    .upload(activeShare.path, payload, {
      cacheControl: "60",
      contentType: "application/json",
      upsert: true,
    });

  if (error) throw error;
  return true;
}

async function removePublicShareAsset(path) {
  if (!cloudUser || !supabaseClient || !isValidPublicSharePath(path)) return false;
  const { error } = await supabaseClient.storage
    .from(PUBLIC_SHARE_BUCKET)
    .remove([path]);
  if (error) throw error;
  return true;
}

async function loadPublicShare(path) {
  elements.sharedBanner.hidden = false;
  document.body.classList.add("shared-view");

  if (!isValidPublicSharePath(path)) {
    elements.sharedBanner.dataset.state = "error";
    elements.sharedBanner.innerHTML = '<span><i aria-hidden="true"></i> SHARE LINK INVALID</span><strong>NO DATA LOADED</strong>';
    return;
  }

  try {
    const { data } = supabaseClient.storage
      .from(PUBLIC_SHARE_BUCKET)
      .getPublicUrl(path);
    const publicUrl = new URL(data.publicUrl);
    publicUrl.searchParams.set("v", String(Date.now()));
    const response = await fetch(publicUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`Share returned ${response.status}`);
    const snapshot = await response.json();
    if (!snapshot?.days || !snapshot?.checkins) throw new Error("Invalid share payload");

    state = migrateState(snapshot);
    render();
  } catch (error) {
    console.warn("Could not load public progress share.", error);
    elements.sharedBanner.dataset.state = "error";
    elements.sharedBanner.innerHTML = '<span><i aria-hidden="true"></i> SHARE LINK UNAVAILABLE</span><strong>ASK FOR A NEW LINK</strong>';
  }
}

async function copyText(value) {
  if (!value) return false;
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch (error) {
    const input = document.createElement("textarea");
    input.value = value;
    input.setAttribute("readonly", "");
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.append(input);
    input.select();
    const copied = document.execCommand("copy");
    input.remove();
    return copied;
  }
}

async function handleSharePrimary() {
  const activeShare = normalisePublicShare(state.publicShare);
  if (activeShare) {
    const copied = await copyText(getPublicShareUrl(activeShare.path));
    showToast(copied ? "Public link copied." : "Could not copy the link.");
    return;
  }

  if (!cloudUser) {
    elements.settingsDialog.close();
    openAuthDialog();
    return;
  }

  elements.sharePrimaryButton.disabled = true;
  state.publicShare = {
    enabled: true,
    path: `${cloudUser.id}/${crypto.randomUUID()}.json`,
  };
  const saved = await persist({ allowBackupSetup: false });
  elements.sharePrimaryButton.disabled = false;
  renderShareControls();

  if (!saved || !lastCloudSynced) {
    showToast("Link isn’t live yet. We’ll retry when you’re online.");
    return;
  }

  await copyText(getPublicShareUrl());
  showToast("Public read-only link created and copied.");
}

async function stopPublicSharing() {
  const activeShare = normalisePublicShare(state.publicShare);
  if (!activeShare) return;
  if (!cloudUser) {
    elements.settingsDialog.close();
    openAuthDialog();
    return;
  }

  elements.shareStopButton.disabled = true;
  try {
    await removePublicShareAsset(activeShare.path);
    state.publicShare = null;
    await persist({ allowBackupSetup: false });
    renderShareControls();
    showToast("Public link disabled.");
  } catch (error) {
    console.warn("Could not disable public share.", error);
    showToast("Could not disable the link. Try again.");
  } finally {
    elements.shareStopButton.disabled = false;
  }
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.days && saved?.checkins) {
      const migrated = migrateState(saved);
      didMigrateOnLoad = saved.version !== DATA_VERSION;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      return migrated;
    }
  } catch (error) {
    console.warn("Could not read saved challenge.", error);
  }
  return emptyState();
}

function migrateState(saved) {
  const migrated = {
    ...emptyState(),
    updatedAt: getLatestStateTimestamp(saved),
    startedAt: saved.startedAt || null,
    checkins: remapCheckins(saved.checkins),
    publicShare: normalisePublicShare(saved.publicShare),
  };

  Object.entries(saved.days || {}).forEach(([day, record]) => {
    const groups = createGroups();
    const positions = { Triceps: 0, Biceps: 0 };

    if (record.groups) {
      MUSCLE_GROUPS.forEach((muscle) => {
        (record.groups[muscle] || []).slice(0, 5).forEach((oldSet, index) => {
          groups[muscle][index] = {
            logged: Boolean(oldSet.logged),
            reps: normaliseReps(oldSet.reps),
            weight: oldSet.weight || "",
          };
        });
      });
    } else {
      (record.sets || []).forEach((oldSet) => {
        const muscle = oldSet.muscle === "Biceps" ? "Biceps" : "Triceps";
        const index = positions[muscle];
        if (index >= 5) return;
        groups[muscle][index] = {
          logged: Boolean(oldSet.logged),
          reps: normaliseReps(oldSet.reps),
          weight: oldSet.weight || "",
        };
        positions[muscle] += 1;
      });
    }

    const complete = isCompleteGroups(groups);
    const hasLoggedSets = getLoggedSetsFromGroups(groups).length > 0;

    migrated.days[day] = {
      groups,
      complete,
      partial: !complete && hasLoggedSets,
      location: ["gym", "home"].includes(record.location)
        ? record.location
        : null,
      updatedAt: record.updatedAt || null,
    };
  });

  return migrated;
}

function remapCheckins(checkins = {}) {
  const remapped = Object.fromEntries(
    Object.entries(checkins).map(([day, entry]) => {
      if (!entry || typeof entry !== "object") return [day, entry];
      const { weight: removedWeight, ...measurementOnly } = entry;
      return [day, measurementOnly];
    }),
  );
  [
    [8, 7],
    [16, 14],
    [24, 21],
    [32, 28],
  ].forEach(([oldDay, newDay]) => {
    if (remapped[oldDay] && !remapped[newDay]) {
      remapped[newDay] = remapped[oldDay];
    }
  });
  return remapped;
}

function getLatestStateTimestamp(candidate = state) {
  const timestamps = [
    candidate?.updatedAt,
    candidate?.startedAt,
    ...Object.values(candidate?.days || {}).map((entry) => entry?.updatedAt),
    ...Object.values(candidate?.checkins || {}).map((entry) => entry?.updatedAt),
  ]
    .map((value) => Date.parse(value))
    .filter(Number.isFinite);

  return timestamps.length
    ? new Date(Math.max(...timestamps)).toISOString()
    : null;
}

function hasMeaningfulState(candidate = state) {
  return Boolean(
    candidate?.startedAt ||
      Object.keys(candidate?.days || {}).length ||
      Object.keys(candidate?.checkins || {}).length,
  );
}

async function persist({ allowBackupSetup = true } = {}) {
  lastCloudSynced = false;
  state.version = DATA_VERSION;
  state.updatedAt = new Date().toISOString();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    showToast("Not enough space to save. Download a backup and use smaller photos.");
    return false;
  }

  lastCloudSynced = await queueCloudSync();
  await syncAutomaticBackup({
    allowSetup: allowBackupSetup && !cloudUser,
  });
  return true;
}

function setCloudStatus(status, message) {
  elements.cloudStatus.dataset.state = status;
  elements.cloudStatusText.textContent = message;
  elements.syncButton.dataset.state = status;
  elements.syncButtonLabel.textContent =
    status === "synced"
      ? "Synced"
      : status === "syncing"
        ? "Syncing"
        : status === "error"
          ? "Offline"
          : "Sync";
  elements.syncButton.setAttribute("aria-label", `Sync status: ${message}`);
  elements.cloudAccount.textContent = cloudUser?.email || "Not signed in";
  elements.cloudAuthButton.textContent = cloudUser ? "Sign out" : "Sign in to sync";
  renderShareControls();
}

function setAuthMessage(message, tone = "info") {
  elements.authMessage.textContent = message;
  elements.authMessage.dataset.tone = tone;
  elements.authMessage.hidden = !message;
}

function openAuthDialog() {
  setAuthMessage(
    location.protocol === "file:"
      ? "Sign in on the live website. Download your backup here, then import it there."
      : "",
  );
  elements.authDialog.showModal();
  elements.authEmailInput.focus();
}

async function handleCloudAuthButton() {
  if (!supabaseClient) {
    showToast("Sync isn’t ready. Reload and try again.");
    return;
  }

  if (!cloudUser) {
    openAuthDialog();
    return;
  }

  elements.cloudAuthButton.disabled = true;
  const { error } = await supabaseClient.auth.signOut();
  elements.cloudAuthButton.disabled = false;
  if (error) {
    showToast("Could not sign out. Try again.");
    return;
  }

  cloudUser = null;
  setCloudStatus("local", "Signed out");
  showToast("Signed out.");
}

async function sendMagicLink(event) {
  event.preventDefault();
  const email = elements.authEmailInput.value.trim();
  if (!email || !supabaseClient) return;

  elements.sendMagicLinkButton.disabled = true;
  elements.sendMagicLinkButton.textContent = "Sending…";
  setAuthMessage("");

  const { error } = await supabaseClient.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: LIVE_APP_URL,
      shouldCreateUser: true,
    },
  });

  elements.sendMagicLinkButton.disabled = false;
  elements.sendMagicLinkButton.textContent = "Send sign-in link";

  if (error) {
    console.warn("Could not send Supabase sign-in link.", error);
    setAuthMessage(error.message || "Could not send the sign-in link.", "error");
    return;
  }

  setAuthMessage(
    location.protocol === "file:"
      ? "Link sent. Open it, then import your backup on the live website."
      : "Link sent. Open it on this device to finish signing in.",
  );
  showToast("Sign-in link sent.");
}

async function initCloudSync() {
  if (!window.supabase?.createClient) {
    setCloudStatus("error", "Can’t sync right now · your changes are saved");
    elements.cloudAuthButton.disabled = true;
    return;
  }

  supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY,
    {
      auth: {
        persistSession: !isSharedView,
        autoRefreshToken: !isSharedView,
        detectSessionInUrl: !isSharedView,
      },
    },
  );

  if (isSharedView) {
    await loadPublicShare(publicSharePath);
    return;
  }

  supabaseClient.auth.onAuthStateChange((event, session) => {
    window.setTimeout(() => {
      if (event === "SIGNED_OUT" || !session) {
        cloudUser = null;
        setCloudStatus("local", "Not syncing · sign in to sync devices");
        return;
      }

      if (!cloudUser || cloudUser.id !== session.user.id) {
        scheduleCloudSession(session);
      }
    }, 0);
  });

  const { data, error } = await supabaseClient.auth.getSession();
  if (error) {
    console.warn("Could not restore Supabase session.", error);
    setCloudStatus("error", "Can’t sync right now · your changes are saved");
    return;
  }

  if (data.session) {
    await scheduleCloudSession(data.session);
  } else {
    setCloudStatus("local", "Not syncing · sign in to sync devices");
  }
}

function scheduleCloudSession(session) {
  cloudSessionPromise = cloudSessionPromise
    .catch(() => undefined)
    .then(() => activateCloudSession(session));
  return cloudSessionPromise;
}

async function activateCloudSession(session) {
  if (!session?.user) return;
  cloudUser = session.user;
  setCloudStatus("syncing", "Checking for updates…");

  try {
    await reconcileCloudState();
  } catch (error) {
    console.warn("Could not reconcile Supabase state.", error);
    setCloudStatus("error", "Can’t sync right now · your changes are saved");
  }
}

async function reconcileCloudState() {
  const user = cloudUser;
  if (!user || !supabaseClient) return false;

  const { data: cloudRow, error } = await supabaseClient
    .from("challenge_states")
    .select("data, updated_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) throw error;

  if (!cloudRow) {
    const migratedExistingData = hasMeaningfulState(state);
    await writeCloudState();
    if (migratedExistingData) showToast("Your progress is up to date.");
    return true;
  }

  const cloudState = migrateState(cloudRow.data || emptyState());
  const localUpdatedAt = Date.parse(getLatestStateTimestamp(state)) || 0;
  const cloudUpdatedAt =
    Date.parse(getLatestStateTimestamp(cloudState) || cloudRow.updated_at) || 0;

  if (hasMeaningfulState(state) && localUpdatedAt > cloudUpdatedAt) {
    await writeCloudState();
    return true;
  }

  state = await hydrateCloudPhotos(cloudState);
  writeLocalCache();
  render();
  await syncPublicShare();
  setCloudStatus("synced", "Up to date");
  return true;
}

function queueCloudSync() {
  if (!cloudUser || !supabaseClient) return Promise.resolve(false);

  cloudWriteChain = cloudWriteChain
    .catch(() => false)
    .then(async () => {
      try {
        await writeCloudState();
        return true;
      } catch (error) {
        console.warn("Could not sync challenge to Supabase.", error);
        setCloudStatus("error", "Can’t sync right now · retrying");
        return false;
      }
    });

  return cloudWriteChain;
}

async function writeCloudState() {
  const user = cloudUser;
  if (!user || !supabaseClient) return false;

  setCloudStatus("syncing", "Saving…");
  const cloudState = await prepareCloudState(user.id);
  const { error } = await supabaseClient.from("challenge_states").upsert(
    {
      user_id: user.id,
      data: cloudState,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) throw error;
  await syncPublicShare();
  setCloudStatus("synced", "Up to date");
  return true;
}

async function prepareCloudState(userId) {
  const cloudState = structuredClone(state);
  let addedPhotoPath = false;

  for (const [day, record] of Object.entries(cloudState.checkins || {})) {
    const localRecord = state.checkins[day];
    if (record?.photo?.startsWith("data:image/")) {
      const photoFingerprint = await getPhotoFingerprint(record.photo);
      if (
        record.photoPath &&
        record.photoFingerprint === photoFingerprint
      ) {
        delete record.photo;
        continue;
      }

      const blob = await dataUrlToBlob(record.photo);
      const extension = getImageExtension(blob.type);
      const path = record.photoPath || `${userId}/day-${day}.${extension}`;
      const { error } = await supabaseClient.storage
        .from(PHOTO_BUCKET)
        .upload(path, blob, {
          cacheControl: "3600",
          contentType: blob.type || "image/jpeg",
          upsert: true,
        });

      if (error) throw error;
      record.photoPath = path;
      record.photoFingerprint = photoFingerprint;
      localRecord.photoPath = path;
      localRecord.photoFingerprint = photoFingerprint;
      addedPhotoPath = true;
    }

    if (record?.photoPath) delete record.photo;
  }

  if (addedPhotoPath) writeLocalCache();
  return cloudState;
}

async function hydrateCloudPhotos(cloudState) {
  const downloads = Object.values(cloudState.checkins || {})
    .filter((record) => record?.photoPath && !record.photo)
    .map(async (record) => {
      const { data, error } = await supabaseClient.storage
        .from(PHOTO_BUCKET)
        .download(record.photoPath);
      if (error) {
        console.warn("Could not download a check-in photo.", error);
        return;
      }
      record.photo = await blobToDataUrl(data);
    });

  await Promise.all(downloads);
  return cloudState;
}

async function dataUrlToBlob(dataUrl) {
  const response = await fetch(dataUrl);
  return response.blob();
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

function getImageExtension(type) {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  return "jpg";
}

async function getPhotoFingerprint(dataUrl) {
  if (!window.crypto?.subtle) {
    return `${dataUrl.length}:${dataUrl.slice(-32)}`;
  }

  const bytes = new TextEncoder().encode(dataUrl);
  const digest = await window.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function writeLocalCache() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (error) {
    console.warn("Could not update local challenge cache.", error);
    return false;
  }
}

async function removeCloudPhoto(photoPath) {
  if (!photoPath || !cloudUser || !supabaseClient) return;
  const { error } = await supabaseClient.storage
    .from(PHOTO_BUCKET)
    .remove([photoPath]);
  if (error) console.warn("Could not remove old check-in photo.", error);
}

function getSaveDestinationSuffix() {
  if (cloudUser && !lastCloudSynced) return ". Sync will retry.";
  return ".";
}

function setBackupStatus(status, message) {
  elements.backupStatus.dataset.state = status;
  elements.backupStatus.querySelector("span").textContent = message;
  elements.connectBackupButton.textContent =
    status === "connected" ? "Change backup file" : "Choose backup file";
}

function openBackupDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(BACKUP_DB_NAME, 1);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(BACKUP_STORE_NAME)) {
        database.createObjectStore(BACKUP_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getStoredBackupHandle() {
  const database = await openBackupDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(BACKUP_STORE_NAME, "readonly");
    const request = transaction.objectStore(BACKUP_STORE_NAME).get(BACKUP_HANDLE_KEY);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
  });
}

async function storeBackupHandle(handle) {
  const database = await openBackupDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(BACKUP_STORE_NAME, "readwrite");
    transaction.objectStore(BACKUP_STORE_NAME).put(handle, BACKUP_HANDLE_KEY);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error);
    };
  });
}

async function initAutomaticBackup() {
  if (!("showSaveFilePicker" in window) || !("indexedDB" in window)) {
    setBackupStatus("attention", "File backups aren’t supported in this browser.");
    elements.connectBackupButton.disabled = true;
    return;
  }

  try {
    backupHandle = await getStoredBackupHandle();
    if (!backupHandle) {
      setBackupStatus("idle", "No backup file selected");
      return;
    }

    const permission = await backupHandle.queryPermission({ mode: "readwrite" });
    setBackupStatus(
      permission === "granted" ? "connected" : "attention",
      permission === "granted"
        ? `Backing up to ${backupHandle.name}`
        : `Allow access to ${backupHandle.name}`,
    );
  } catch (error) {
    backupHandle = null;
    setBackupStatus("idle", "No backup file selected");
  }
}

async function chooseBackupFile() {
  if (!("showSaveFilePicker" in window)) return false;

  try {
    const handle = await window.showSaveFilePicker({
      suggestedName: "bigger-arm-challenge-live-backup.json",
      types: [
        {
          description: "Bigger Arm Challenge JSON backup",
          accept: { "application/json": [".json"] },
        },
      ],
    });

    backupHandle = handle;
    try {
      await storeBackupHandle(handle);
    } catch (error) {
      console.warn("Backup file connection will last for this tab only.", error);
    }
    await writeBackupFile();
    setBackupStatus("connected", `Backing up to ${handle.name}`);
    return true;
  } catch (error) {
    if (error?.name !== "AbortError") {
      console.warn("Could not connect backup file.", error);
      setBackupStatus("attention", "Couldn’t open that file · try again");
    } else {
      setBackupStatus("idle", "No backup file selected");
    }
    return false;
  }
}

async function writeBackupFile() {
  const writable = await backupHandle.createWritable();
  await writable.write(JSON.stringify(state, null, 2));
  await writable.close();
}

async function syncAutomaticBackup({ allowSetup = true } = {}) {
  await backupReadyPromise;

  if (!("showSaveFilePicker" in window)) return false;
  if (!backupHandle) {
    return allowSetup ? chooseBackupFile() : false;
  }

  try {
    let permission = await backupHandle.queryPermission({ mode: "readwrite" });
    if (permission !== "granted" && allowSetup) {
      permission = await backupHandle.requestPermission({ mode: "readwrite" });
    }
    if (permission !== "granted") {
      setBackupStatus("attention", `Allow access to ${backupHandle.name}`);
      return false;
    }

    await writeBackupFile();
    setBackupStatus("connected", `${backupHandle.name} is up to date`);
    return true;
  } catch (error) {
    console.warn("Could not update backup file.", error);
    setBackupStatus("attention", "Couldn’t update the backup file");
    return false;
  }
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function normaliseReps(value) {
  const reps = Number(value);
  return clamp(Number.isFinite(reps) ? reps : 10, 0, 30);
}

function getLoggedSetsFromGroups(groups) {
  return MUSCLE_GROUPS.flatMap((muscle) => groups?.[muscle] || []).filter(
    (set) => set.logged,
  );
}

function getLoggedSets(record) {
  return getLoggedSetsFromGroups(record?.groups);
}

function getSetVolume(set) {
  return Number(set.weight || 0) * Number(set.reps || 0) * 2;
}

function getStatsFromSets(sets) {
  return {
    sets: sets.length,
    reps: sets.reduce((sum, set) => sum + Number(set.reps || 0), 0),
    volume: sets.reduce((sum, set) => sum + getSetVolume(set), 0),
  };
}

function getDayStats(record) {
  return getStatsFromSets(getLoggedSets(record));
}

function getGroupStats(groups, muscle) {
  return getStatsFromSets((groups[muscle] || []).filter((set) => set.logged));
}

function isCompleteGroups(groups) {
  return MUSCLE_GROUPS.every((muscle) => {
    const logged = (groups[muscle] || []).filter((set) => set.logged);
    return (
      logged.length === 5 &&
      logged.every(
        (set) =>
          Number(set.weight) > 0 &&
          Number(set.reps) >= 0 &&
          Number(set.reps) <= 30,
      )
    );
  });
}

function getCompletedDays() {
  return getChallengeDayEntries().filter(([, day]) => day.complete).length;
}

function isDayLogged(record) {
  return Boolean(record?.complete || record?.partial);
}

function getChallengeDayEntries() {
  return Object.entries(state.days).filter(([day]) => {
    const dayNumber = Number(day);
    return dayNumber >= 1 && dayNumber <= CHALLENGE_DAYS;
  });
}

function getCurrentDay() {
  if (!state.startedAt) return 1;

  const start = new Date(state.startedAt);
  const today = new Date();
  const startDate = Date.UTC(
    start.getFullYear(),
    start.getMonth(),
    start.getDate(),
  );
  const todayDate = Date.UTC(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  const elapsedDays = Math.floor((todayDate - startDate) / 86_400_000);

  return Math.min(CHALLENGE_DAYS, Math.max(1, elapsedDays + 1));
}

function getVolumeExtremes() {
  const completed = getChallengeDayEntries()
    .filter(([, record]) => record.complete)
    .map(([day, record]) => ({
      day: Number(day),
      volume: getDayStats(record).volume,
    }))
    .sort((a, b) => a.day - b.day);

  if (completed.length < 2) return {};

  const highest = completed.reduce((best, entry) =>
    entry.volume >= best.volume ? entry : best,
  );
  const lowest = completed.reduce((best, entry) =>
    entry.volume < best.volume ? entry : best,
  );

  if (highest.volume === lowest.volume) return {};
  return { highestDay: highest.day, lowestDay: lowest.day };
}

function render() {
  renderDayGrid();
  renderCheckins();
  renderStats();
  renderShareControls();
}

function renderMobileDayFilter(currentDay = getCurrentDay()) {
  const activeWeek = Math.ceil(currentDay / DAYS_PER_WEEK);
  const startDay = (activeWeek - 1) * DAYS_PER_WEEK + 1;
  const endDay = startDay + DAYS_PER_WEEK - 1;
  elements.mobileWeekLabel.textContent =
    `Week ${activeWeek} · D${String(startDay).padStart(2, "0")}–D${String(endDay).padStart(2, "0")}`;
  elements.toggleAllDaysButton.textContent = showAllDays
    ? "Show current week"
    : "View all days";
  elements.toggleAllDaysButton.setAttribute("aria-expanded", String(showAllDays));
  elements.dayGrid.classList.toggle("show-all", showAllDays);
}

function renderDayGrid() {
  const currentDay = getCurrentDay();
  const { highestDay, lowestDay } = getVolumeExtremes();
  elements.dayGrid.innerHTML = "";

  for (let day = 1; day <= CHALLENGE_DAYS; day += 1) {
    const record = state.days[day];
    const completed = Boolean(record?.complete);
    const partial = Boolean(record?.partial);
    const location = ["gym", "home"].includes(record?.location)
      ? record.location
      : null;
    const stats = getDayStats(record);
    const previousRecord = day > 1 ? state.days[day - 1] : null;
    const previousStats = isDayLogged(previousRecord) ? getDayStats(previousRecord) : null;
    const volumeDelta = getDelta(stats.volume, previousStats?.volume, "kg");
    const repsDelta = getDelta(stats.reps, previousStats?.reps, "");
    const badges = [
      partial ? '<span class="day-badge partial">PARTIAL</span>' : "",
      isDayLogged(record) && location
        ? `<span class="day-badge location">${location.toUpperCase()}</span>`
        : "",
      day === highestDay ? '<span class="day-badge">PR VOL</span>' : "",
      day === lowestDay ? '<span class="day-badge low">LOW VOL</span>' : "",
    ].join("");

    const button = document.createElement("button");
    button.type = "button";
    button.className = [
      "day-card",
      completed ? "complete" : "",
      partial ? "partial" : "",
      day === currentDay ? "current" : "",
      CHECKIN_DAYS.includes(day) ? "checkin" : "",
      Math.ceil(day / DAYS_PER_WEEK) !== Math.ceil(currentDay / DAYS_PER_WEEK)
        ? "outside-current-week"
        : "",
    ]
      .filter(Boolean)
      .join(" ");
    button.setAttribute(
      "aria-label",
      `Day ${day}, ${completed ? "complete" : partial ? "partial" : day === currentDay ? "current" : "not complete"}${location ? `, ${location}` : ""}`,
    );

    button.innerHTML = `
      <span class="day-head">
        <span class="day-number">${String(day).padStart(2, "0")}</span>
        <span class="day-badges">${badges}</span>
      </span>
      <span class="day-metrics">
        <span class="day-metric">
          <small>Volume</small>
          <b>${stats.sets ? `${formatNumber(stats.volume)} kg` : "—"}</b>
          <span class="day-delta ${volumeDelta.className}">${stats.sets ? volumeDelta.label : ""}</span>
        </span>
        <span class="day-metric">
          <small>Reps</small>
          <b>${stats.sets ? formatNumber(stats.reps) : "—"}</b>
          <span class="day-delta ${repsDelta.className}">${stats.sets ? repsDelta.label : ""}</span>
        </span>
      </span>
      <span class="day-meta">
        <span>${stats.sets ? `${stats.sets}/10 sets` : day === currentDay ? "Log today" : "Open"}</span>
        <span class="day-tick">${completed ? "✓" : partial ? "–" : "↗"}</span>
      </span>
    `;
    if (isSharedView) {
      button.setAttribute("aria-disabled", "true");
    } else {
      button.addEventListener("click", () => openDay(day));
    }
    elements.dayGrid.append(button);
  }

  renderMobileDayFilter(currentDay);
}

function getDelta(current, previous, unit) {
  if (previous === undefined || previous === null) {
    return { label: "— vs yesterday", className: "" };
  }

  const difference = current - previous;
  const sign = difference > 0 ? "+" : "";
  return {
    label: `${sign}${formatNumber(difference)}${unit ? ` ${unit}` : ""} vs yesterday`,
    className: difference > 0 ? "up" : difference < 0 ? "down" : "",
  };
}

function renderCheckins() {
  elements.checkinGrid.innerHTML = "";

  CHECKIN_DAYS.forEach((day, index) => {
    const record = state.checkins[day];
    const previousRecord = index > 0 ? state.checkins[CHECKIN_DAYS[index - 1]] : null;
    const card = document.createElement("button");
    card.type = "button";
    card.className = `checkin-card${record?.photo ? " has-photo" : ""}`;
    card.setAttribute("aria-label", `Open ${CHECKIN_LABELS[index]} check-in`);

    const leftArm = getMeasurement(record?.leftArm);
    const rightArm = getMeasurement(record?.rightArm);
    const leftDelta = getMeasurementDelta(leftArm, getMeasurement(previousRecord?.leftArm));
    const rightDelta = getMeasurementDelta(
      rightArm,
      getMeasurement(previousRecord?.rightArm),
    );

    card.innerHTML = `
      ${record?.photo ? `<img class="checkin-photo" src="${record.photo}" alt="" /><span class="checkin-shade"></span>` : ""}
      <span class="checkin-card-top">
        <span class="checkin-card-label">${CHECKIN_LABELS[index]}</span>
        <span class="checkin-card-day">D${String(day).padStart(2, "0")}</span>
      </span>
      <span class="checkin-card-data ${leftArm || rightArm ? "" : "empty-checkin"}">
        ${renderArmReading("Left", leftArm, leftDelta)}
        ${renderArmReading("Right", rightArm, rightDelta)}
      </span>
    `;
    if (isSharedView) {
      card.setAttribute("aria-disabled", "true");
    } else {
      card.addEventListener("click", () => openCheckin(day));
    }
    elements.checkinGrid.append(card);
  });
}

function getMeasurement(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function getMeasurementDelta(current, previous) {
  if (current === null || previous === null) {
    return { label: "", percentLabel: "", className: "" };
  }

  const rawDifference = current - previous;
  const difference = Math.round(rawDifference * 10) / 10;
  if (difference === 0) {
    return { label: "", percentLabel: "", className: "" };
  }

  const percentChange = previous === 0 ? null : (rawDifference / previous) * 100;
  const sign = difference > 0 ? "+" : "−";
  return {
    label: `${sign}${Math.abs(difference).toFixed(1)}`,
    percentLabel:
      percentChange === null
        ? ""
        : `${sign}${Math.abs(percentChange).toFixed(1)}%`,
    className: difference > 0 ? "up" : "down",
  };
}

function renderArmReading(label, value, delta) {
  return `
    <span class="arm-reading">
      <small>${label}</small>
      <strong>${value === null ? "—" : `${value.toFixed(1)} <em>cm</em>`}</strong>
      ${delta.label ? `
        <span class="arm-week-deltas">
          <span class="arm-week-delta ${delta.className}">${delta.label}</span>
          ${delta.percentLabel ? `<span class="arm-week-delta percent ${delta.className}">${delta.percentLabel}</span>` : ""}
        </span>
      ` : ""}
    </span>
  `;
}

function getWeeklyStats() {
  return Array.from({ length: CHALLENGE_WEEKS }, (_, index) => {
    const startDay = index * DAYS_PER_WEEK + 1;
    const endDay = startDay + DAYS_PER_WEEK - 1;
    const records = [];

    for (let day = startDay; day <= endDay; day += 1) {
      const record = state.days[day];
      if (isDayLogged(record)) records.push(record);
    }

    const totals = getStatsFromSets(records.flatMap(getLoggedSets));
    return {
      week: index + 1,
      startDay,
      endDay,
      daysLogged: records.length,
      ...totals,
    };
  });
}

function getWeeklyDelta(current, previous, key) {
  if (!current.daysLogged) {
    return { label: "—", className: "neutral" };
  }
  if (!previous?.daysLogged) {
    return { label: "BASELINE", className: "neutral" };
  }

  const compareDailyAverage =
    current.daysLogged < DAYS_PER_WEEK || previous.daysLogged < DAYS_PER_WEEK;
  const currentValue = compareDailyAverage
    ? current[key] / current.daysLogged
    : current[key];
  const previousValue = compareDailyAverage
    ? previous[key] / previous.daysLogged
    : previous[key];
  const comparisonLabel = compareDailyAverage ? "AVG/DAY" : "TOTAL";

  if (!previousValue) {
    return { label: "NO BASELINE", className: "neutral" };
  }

  const difference = currentValue - previousValue;
  const percentage = (difference / previousValue) * 100;

  if (difference === 0) {
    return {
      label: `0.0% ${comparisonLabel}`,
      className: "neutral",
    };
  }

  const sign = difference > 0 ? "+" : "−";
  const className = difference > 0 ? "up" : "down";
  const percentLabel = `${sign}${Math.abs(percentage).toFixed(1)}%`;

  return { label: `${percentLabel} ${comparisonLabel}`, className };
}

function renderWeeklyStats() {
  const weeks = getWeeklyStats();
  const activeWeek = Math.ceil(getCurrentDay() / DAYS_PER_WEEK);

  const rows = weeks.map((week, index) => {
    const previous = weeks[index - 1];
    const volumeDelta = getWeeklyDelta(week, previous, "volume");
    const repsDelta = getWeeklyDelta(week, previous, "reps");
    const hasData = week.daysLogged > 0;
    const isActive = week.week === activeWeek;

    return `
      <tr class="${isActive ? "active" : ""}${hasData ? "" : " empty"}">
        <th scope="row">
          <span class="week-table-number">${String(week.week).padStart(2, "0")}</span>
          <small>D${String(week.startDay).padStart(2, "0")}–D${String(week.endDay).padStart(2, "0")}</small>
        </th>
        <td>
          <strong>${week.daysLogged}/7</strong>
          <small class="week-table-status">${isActive ? "CURRENT" : ""}</small>
        </td>
        <td class="numeric">
          <strong>${hasData ? formatNumber(week.volume) : "—"}</strong>
          <small>${hasData ? "KG" : ""}</small>
          ${hasData ? `<span class="week-table-delta ${volumeDelta.className}">${volumeDelta.label}</span>` : ""}
        </td>
        <td class="numeric">
          <strong>${hasData ? formatNumber(week.reps) : "—"}</strong>
          ${hasData ? `<span class="week-table-delta ${repsDelta.className}">${repsDelta.label}</span>` : ""}
        </td>
      </tr>
    `;
  }).join("");

  elements.weeklyStatsGrid.innerHTML = `
    <table class="weekly-table">
      <caption class="sr-only">Weekly volume and reps comparison</caption>
      <thead>
        <tr>
          <th scope="col">WEEK</th>
          <th scope="col">DAYS</th>
          <th scope="col">VOLUME</th>
          <th scope="col">REPS</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderStats() {
  const completed = getCompletedDays();
  const loggedSets = getChallengeDayEntries().flatMap(([, record]) =>
    getLoggedSets(record),
  );
  const totals = getStatsFromSets(loggedSets);
  const currentDay = getCurrentDay();
  const loggedDays = getChallengeDayEntries().filter(([, record]) =>
    isDayLogged(record),
  ).length;
  const currentRecord = state.days[currentDay];

  elements.completedDays.textContent = completed;
  elements.progressOrbit.style.setProperty(
    "--progress",
    `${(completed / CHALLENGE_DAYS) * 360}deg`,
  );
  elements.progressBarFill.style.width =
    `${(loggedDays / CHALLENGE_DAYS) * 100}%`;
  elements.progressBarLabel.textContent =
    `${loggedDays} / ${CHALLENGE_DAYS} days logged`;
  elements.progressBar.setAttribute("aria-valuenow", String(loggedDays));
  elements.totalVolume.textContent = `${formatNumber(totals.volume)} kg`;
  elements.totalSets.textContent = `${totals.sets.toLocaleString()} sets logged`;
  elements.totalReps.textContent = totals.reps.toLocaleString();
  elements.currentDayStat.textContent = String(currentDay).padStart(2, "0");
  elements.todayButtonLabel.textContent =
    loggedDays === CHALLENGE_DAYS
      ? `Review day ${CHALLENGE_DAYS}`
      : isDayLogged(currentRecord)
        ? `Review day ${String(currentDay).padStart(2, "0")}`
        : `${state.startedAt ? "Log" : "Start"} day ${String(currentDay).padStart(2, "0")}`;

  const dueCheckinDay = isSharedView
    ? null
    : CHECKIN_DAYS.find((day) => day <= currentDay && !state.checkins[day]);
  elements.checkinDueButton.hidden = !dueCheckinDay;
  if (dueCheckinDay) {
    const checkinIndex = CHECKIN_DAYS.indexOf(dueCheckinDay);
    elements.checkinDueButton.dataset.day = String(dueCheckinDay);
    elements.checkinDueButtonLabel.textContent =
      checkinIndex === 0
        ? "Add baseline check-in"
        : `Add ${CHECKIN_LABELS[checkinIndex].toLowerCase()} check-in`;
  } else {
    delete elements.checkinDueButton.dataset.day;
  }

  if (state.startedAt) {
    elements.challengeDate.textContent = `since ${formatDate(state.startedAt)}`;
  } else {
    elements.challengeDate.textContent = "not started";
  }

  const leftChange = getArmChange("leftArm");
  const rightChange = getArmChange("rightArm");

  elements.armChange.textContent =
    `L ${formatArmChange(leftChange)} / R ${formatArmChange(rightChange)}`;
  if (leftChange !== null || rightChange !== null) {
    elements.armChangeUnit.textContent = "cm since baseline";
  } else {
    elements.armChangeUnit.textContent = "needs 2 check-ins";
  }

  renderWeeklyStats();
}

function getArmChange(key) {
  const measurements = CHECKIN_DAYS.map((day) =>
    getMeasurement(state.checkins[day]?.[key]),
  ).filter((value) => value !== null);
  if (measurements.length < 2) return null;
  return Math.round((measurements.at(-1) - measurements[0]) * 10) / 10;
}

function formatArmChange(change) {
  if (change === null) return "—";
  if (change === 0) return "0.0";
  return `${change > 0 ? "+" : "−"}${Math.abs(change).toFixed(1)}`;
}

function openDay(day) {
  if (restTimerDay !== day) {
    resetRestTimer();
  }
  activeDay = day;
  const saved = state.days[day]?.groups;
  draftGroups = saved ? structuredClone(saved) : createPrefilledGroups(day);
  draftLocation = getTrainingLocation(day);
  dayDraftBaseline = getDayDraftSnapshot();
  elements.dayDialogTitle.textContent = `Day ${String(day).padStart(2, "0")}`;
  elements.dayDialogEyebrow.textContent =
    day === getCurrentDay() ? "CURRENT DAY" : "DAILY LOG";
  hideDayClosePrompt({ restoreFocus: false });
  clearDayStatus();
  renderTrainingLocation();
  renderSetLists();
  elements.dayDialog.showModal();
}

function getDayDraftSnapshot() {
  return JSON.stringify({
    groups: draftGroups,
    location: draftLocation,
  });
}

function hasUnsavedDayChanges() {
  return (
    elements.dayDialog.open &&
    dayDraftBaseline !== null &&
    getDayDraftSnapshot() !== dayDraftBaseline
  );
}

function requestCloseDayDialog() {
  if (dayClosePending) return;

  if (!elements.dayClosePrompt.hidden) {
    hideDayClosePrompt();
    return;
  }

  if (hasUnsavedDayChanges()) {
    showDayClosePrompt();
    return;
  }

  elements.dayDialog.close();
}

function showDayClosePrompt() {
  elements.dayClosePrompt.hidden = false;
  elements.saveCurrentDayButton.focus();
}

function hideDayClosePrompt({ restoreFocus = true } = {}) {
  elements.dayClosePrompt.hidden = true;
  if (restoreFocus && elements.dayDialog.open) {
    document.querySelector("#closeDayButton").focus();
  }
}

async function saveCurrentDayAndClose() {
  if (dayClosePending) return;
  dayClosePending = true;
  elements.discardDayChangesButton.disabled = true;
  elements.saveCurrentDayButton.disabled = true;
  hideDayClosePrompt({ restoreFocus: false });

  try {
    await storeTrainingDay(isCompleteGroups(draftGroups));
  } finally {
    dayClosePending = false;
    elements.discardDayChangesButton.disabled = false;
    elements.saveCurrentDayButton.disabled = false;
  }
}

function discardDayChangesAndClose() {
  hideDayClosePrompt({ restoreFocus: false });
  elements.dayDialog.close();
  showToast(`Unsaved changes for day ${String(activeDay).padStart(2, "0")} discarded.`);
}

function showDayStatus(message, tone = "saved") {
  elements.daySaveStatus.textContent = message;
  elements.daySaveStatus.dataset.tone = tone;
  elements.daySaveStatus.hidden = false;
}

function clearDayStatus() {
  elements.daySaveStatus.hidden = true;
  elements.daySaveStatus.textContent = "";
  delete elements.daySaveStatus.dataset.tone;
}

function getTrainingLocation(day) {
  const savedLocation = state.days[day]?.location;
  if (["gym", "home"].includes(savedLocation)) return savedLocation;

  for (let previousDay = day - 1; previousDay >= 1; previousDay -= 1) {
    const previousRecord = state.days[previousDay];
    if (
      isDayLogged(previousRecord) &&
      ["gym", "home"].includes(previousRecord.location)
    ) {
      return previousRecord.location;
    }
  }

  return "gym";
}

function renderTrainingLocation() {
  elements.trainingLocationButtons.forEach((button) => {
    const active = button.dataset.trainingLocation === draftLocation;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function formatRestTime(elapsedSeconds) {
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function updateRestTimer() {
  if (!restTimerStartedAt) return;
  const elapsedSeconds = Math.max(
    0,
    Math.floor((Date.now() - restTimerStartedAt) / 1000),
  );
  elements.restTimerValue.textContent = formatRestTime(elapsedSeconds);
  elements.restTimerState.textContent =
    elapsedSeconds < 60
      ? "Resting"
      : `${Math.floor(elapsedSeconds / 60)} min rest`;
}

function startRestTimer() {
  restTimerStartedAt = Date.now();
  restTimerDay = activeDay;
  elements.restTimer.classList.remove("dismissed");
  elements.restTimer.classList.remove("inactive");
  elements.cancelRestTimerButton.disabled = false;
  updateRestTimer();

  window.clearInterval(restTimerInterval);
  restTimerInterval = window.setInterval(updateRestTimer, 1000);
}

function resetRestTimer() {
  window.clearInterval(restTimerInterval);
  restTimerStartedAt = null;
  restTimerInterval = null;
  restTimerDay = null;
  elements.restTimer.classList.remove("dismissed");
  elements.restTimer.classList.add("inactive");
  elements.cancelRestTimerButton.disabled = true;
  elements.restTimerValue.textContent = "00:00";
  elements.restTimerState.textContent = "Complete a set to start";
}

function cancelRestTimer() {
  resetRestTimer();
  elements.restTimer.classList.add("dismissed");
}

function renderSetLists() {
  renderGroupList("Triceps", elements.tricepsSetList);
  renderGroupList("Biceps", elements.bicepsSetList);
  updateDaySummary();
}

function renderGroupList(muscle, container) {
  container.innerHTML = "";

  draftGroups[muscle].forEach((set, index) => {
    const row = document.createElement("div");
    row.className = `set-row${set.logged ? " logged" : ""}`;
    row.innerHTML = `
      <span class="set-index">S${String(index + 1).padStart(2, "0")}</span>
      <label class="weight-control">
        <input
          class="weight-input"
          type="number"
          step="any"
          inputmode="decimal"
          value="${set.weight}"
          aria-label="${muscle} set ${index + 1} weight per arm in kilograms"
          placeholder="0"
        />
        <small>KG/ARM</small>
      </label>
      <span class="reps-control">
        <button type="button" class="rep-step rep-minus" aria-label="Decrease reps" ${set.reps <= 0 ? "disabled" : ""}>−</button>
        <span class="rep-value"><strong>${set.reps}</strong><small>REPS</small></span>
        <button type="button" class="rep-step rep-plus" aria-label="Increase reps" ${set.reps >= 30 ? "disabled" : ""}>+</button>
      </span>
      <span class="set-volume"><strong>${formatNumber(getSetVolume(set))}</strong><small>VOLUME</small></span>
      <button type="button" class="set-enable" aria-label="${set.logged ? "Remove" : "Log"} ${muscle} set ${index + 1}"></button>
    `;

    const weightInput = row.querySelector(".weight-input");
    const setVolume = row.querySelector(".set-volume strong");
    const enableButton = row.querySelector(".set-enable");

    weightInput.addEventListener("input", (event) => {
      clearDayStatus();
      set.weight = event.target.value;
      setVolume.textContent = formatNumber(getSetVolume(set));
      updateDaySummary();
    });

    row.querySelector(".rep-minus").addEventListener("click", () => {
      clearDayStatus();
      set.reps = Math.max(0, set.reps - 1);
      renderSetLists();
    });

    row.querySelector(".rep-plus").addEventListener("click", () => {
      clearDayStatus();
      set.reps = Math.min(30, set.reps + 1);
      renderSetLists();
    });

    enableButton.addEventListener("click", () => {
      clearDayStatus();
      set.logged = !set.logged;
      if (set.logged) {
        startRestTimer();
      }
      renderSetLists();
      if (set.logged && !Number(set.weight)) {
        const targetContainer =
          muscle === "Triceps" ? elements.tricepsSetList : elements.bicepsSetList;
        targetContainer.querySelectorAll(".weight-input")[index]?.focus();
      }
    });

    container.append(row);
  });
}

function updateDaySummary() {
  const triceps = getGroupStats(draftGroups, "Triceps");
  const biceps = getGroupStats(draftGroups, "Biceps");
  const totals = getStatsFromSets(getLoggedSetsFromGroups(draftGroups));

  elements.loggedTricepsCount.textContent = triceps.sets;
  elements.loggedBicepsCount.textContent = biceps.sets;
  elements.loggedRepsCount.textContent = formatNumber(totals.reps);
  elements.loggedVolumeCount.textContent = formatNumber(totals.volume);
  elements.tricepsBlockTotal.textContent =
    `${triceps.sets} sets · ${formatNumber(triceps.volume)} kg`;
  elements.bicepsBlockTotal.textContent =
    `${biceps.sets} sets · ${formatNumber(biceps.volume)} kg`;
}

async function saveDay() {
  const invalidGroup = MUSCLE_GROUPS.find((muscle) => {
    const logged = draftGroups[muscle].filter((set) => set.logged);
    return logged.length !== 5;
  });

  if (invalidGroup) {
    showDayStatus(
      `Not complete · log all 5 ${invalidGroup.toLowerCase()} sets.`,
      "warning",
    );
    return;
  }

  const missingWeight = getLoggedSetsFromGroups(draftGroups).some(
    (set) => Number(set.weight) <= 0,
  );
  if (missingWeight) {
    showDayStatus("Not complete · add kg to every logged set.", "warning");
    return;
  }

  await storeTrainingDay(true);
}

async function savePartialDay() {
  if (!hasUnsavedDayChanges()) {
    showDayStatus("No new changes to save.", "warning");
    return;
  }

  await storeTrainingDay(isCompleteGroups(draftGroups), { closeDialog: false });
}

async function storeTrainingDay(complete, { closeDialog = true } = {}) {
  const shouldSuggestSync = !cloudUser && !syncNudgeShown && !isSharedView;
  if (!state.startedAt) {
    state.startedAt = new Date().toISOString();
  }

  state.days[activeDay] = {
    groups: structuredClone(draftGroups),
    complete,
    partial: !complete,
    location: draftLocation,
    updatedAt: new Date().toISOString(),
  };

  if (!(await persist())) {
    showDayStatus(
      "Could not save this snapshot. Keep this workout open.",
      "warning",
    );
    return false;
  }
  dayDraftBaseline = getDayDraftSnapshot();
  syncNudgeShown = true;
  render();
  const status = complete ? "saved" : "saved as partial";
  const syncSuggestion = shouldSuggestSync
    ? " Sign in to use it on other devices."
    : "";
  const message = `Day ${String(activeDay).padStart(2, "0")} ${status}${getSaveDestinationSuffix()}${syncSuggestion}`;

  if (closeDialog) {
    elements.dayDialog.close();
    showToast(message);
  } else {
    showDayStatus(`${message} Keep going.`);
  }

  return true;
}

async function clearDay() {
  if (!state.days[activeDay]) {
    resetRestTimer();
    draftGroups = createPrefilledGroups(activeDay);
    draftLocation = getTrainingLocation(activeDay);
    dayDraftBaseline = getDayDraftSnapshot();
    renderTrainingLocation();
    renderSetLists();
    return;
  }

  if (!window.confirm(`Clear all data for day ${activeDay}?`)) return;
  delete state.days[activeDay];
  await persist();
  resetRestTimer();
  draftGroups = createPrefilledGroups(activeDay);
  draftLocation = getTrainingLocation(activeDay);
  dayDraftBaseline = getDayDraftSnapshot();
  renderTrainingLocation();
  renderSetLists();
  render();
  showToast(`Day ${String(activeDay).padStart(2, "0")} cleared.`);
}

function openCheckin(day) {
  activeCheckinDay = day;
  const index = CHECKIN_DAYS.indexOf(day);
  const record = state.checkins[day] || {};
  elements.checkinDialogTitle.textContent =
    `Day ${String(day).padStart(2, "0")} / ${CHECKIN_LABELS[index]}`;
  elements.leftArmInput.value = record.leftArm || "";
  elements.rightArmInput.value = record.rightArm || "";
  elements.noteInput.value = record.note || "";
  draftPhoto = record.photo || null;
  updatePhotoPreview();
  elements.photoInput.value = "";
  elements.checkinDialog.showModal();
}

function updatePhotoPreview() {
  elements.photoPreview.hidden = !draftPhoto;
  elements.photoPrompt.hidden = Boolean(draftPhoto);
  if (draftPhoto) elements.photoPreview.src = draftPhoto;
}

async function handlePhoto(file) {
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    showToast("Choose an image file.");
    return;
  }

  try {
    draftPhoto = await compressImage(file);
    updatePhotoPreview();
    showToast("Photo ready.");
  } catch (error) {
    showToast("Could not read that image.");
  }
}

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const image = new Image();
      image.onerror = reject;
      image.onload = () => {
        const maxSide = 1100;
        const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.72));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function saveCheckin() {
  const leftArm = elements.leftArmInput.value;
  const rightArm = elements.rightArmInput.value;

  if (!leftArm && !rightArm && !draftPhoto) {
    showToast("Add a measurement or photo.");
    return;
  }

  state.checkins[activeCheckinDay] = {
    leftArm,
    rightArm,
    note: elements.noteInput.value.trim(),
    photo: draftPhoto,
    photoPath: state.checkins[activeCheckinDay]?.photoPath || null,
    photoFingerprint:
      state.checkins[activeCheckinDay]?.photoFingerprint || null,
    updatedAt: new Date().toISOString(),
  };

  if (await persist()) {
    elements.checkinDialog.close();
    render();
    showToast(`Check-in saved${getSaveDestinationSuffix()}`);
  }
}

async function clearCheckin() {
  if (!state.checkins[activeCheckinDay]) {
    elements.leftArmInput.value = "";
    elements.rightArmInput.value = "";
    elements.noteInput.value = "";
    draftPhoto = null;
    updatePhotoPreview();
    return;
  }

  if (!window.confirm(`Clear the day ${activeCheckinDay} check-in?`)) return;
  const photoPath = state.checkins[activeCheckinDay]?.photoPath;
  delete state.checkins[activeCheckinDay];
  await persist();
  await removeCloudPhoto(photoPath);
  elements.checkinDialog.close();
  render();
  showToast("Check-in cleared.");
}

function exportData() {
  const payload = JSON.stringify(state, null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download =
    `bigger-arm-challenge-backup-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  showToast("Backup exported.");
}

function importData(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const imported = JSON.parse(reader.result);
      if (
        !imported ||
        !Number.isInteger(imported.version) ||
        imported.version < 1 ||
        imported.version > DATA_VERSION ||
        !imported.days ||
        !imported.checkins
      ) {
        throw new Error("Invalid backup");
      }
      if (!window.confirm("Replace current challenge data with this backup?")) return;
      state = migrateState(imported);
      if (!(await persist())) return;
      render();
      showToast("Backup imported.");
    } catch (error) {
      showToast("That is not a valid Bigger Arm Challenge backup.");
    }
  };
  reader.readAsText(file);
}

async function resetChallenge() {
  const confirmation = window.prompt('Type "RESET" to erase the entire experiment.');
  if (confirmation !== "RESET") return;
  const activeShare = normalisePublicShare(state.publicShare);
  if (activeShare && !cloudUser) {
    showToast("Sign in and stop the public link before resetting.");
    return;
  }
  const photoPaths = Object.values(state.checkins)
    .map((record) => record?.photoPath)
    .filter(Boolean);
  if (activeShare) {
    try {
      await removePublicShareAsset(activeShare.path);
    } catch (error) {
      console.warn("Could not remove public share before reset.", error);
      showToast("Could not disable the public link. Reset stopped.");
      return;
    }
  }
  state = emptyState();
  resetRestTimer();
  if (!(await persist({ allowBackupSetup: false }))) return;
  await Promise.all(photoPaths.map(removeCloudPhoto));
  elements.settingsDialog.close();
  render();
  showToast("Experiment reset.");
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString(undefined, {
    maximumFractionDigits: 1,
  });
}

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");
  toastTimer = window.setTimeout(() => elements.toast.classList.remove("visible"), 2600);
}

elements.todayButton.addEventListener("click", () => openDay(getCurrentDay()));
elements.checkinDueButton.addEventListener("click", () => {
  const day = Number(elements.checkinDueButton.dataset.day);
  if (CHECKIN_DAYS.includes(day)) openCheckin(day);
});
elements.toggleAllDaysButton.addEventListener("click", () => {
  showAllDays = !showAllDays;
  renderMobileDayFilter();
});
document
  .querySelector("#closeDayButton")
  .addEventListener("click", requestCloseDayDialog);
document.querySelector("#closeCheckinButton").addEventListener("click", () => {
  elements.checkinDialog.close();
});
document.querySelector("#saveDayButton").addEventListener("click", saveDay);
document
  .querySelector("#savePartialDayButton")
  .addEventListener("click", savePartialDay);
document.querySelector("#clearDayButton").addEventListener("click", clearDay);
elements.cancelRestTimerButton.addEventListener("click", cancelRestTimer);
elements.saveCurrentDayButton.addEventListener("click", saveCurrentDayAndClose);
elements.discardDayChangesButton.addEventListener(
  "click",
  discardDayChangesAndClose,
);
elements.keepEditingDayButton.addEventListener("click", hideDayClosePrompt);
elements.dayClosePrompt.addEventListener("click", (event) => {
  if (event.target === elements.dayClosePrompt) hideDayClosePrompt();
});
elements.trainingLocationButtons.forEach((button) => {
  button.addEventListener("click", () => {
    clearDayStatus();
    draftLocation = button.dataset.trainingLocation;
    renderTrainingLocation();
  });
});
document.querySelector("#saveCheckinButton").addEventListener("click", saveCheckin);
document.querySelector("#clearCheckinButton").addEventListener("click", clearCheckin);
elements.photoInput.addEventListener("change", (event) => handlePhoto(event.target.files[0]));
document.querySelector("#settingsExportButton").addEventListener("click", exportData);
elements.settingsImportButton.addEventListener("click", () => elements.importInput.click());
elements.importInput.addEventListener("change", (event) => {
  importData(event.target.files[0]);
  event.target.value = "";
});
document.querySelector("#settingsButton").addEventListener("click", () => {
  elements.settingsDialog.showModal();
});
elements.shareButton.addEventListener("click", () => {
  elements.settingsDialog.showModal();
  elements.sharePrimaryButton.focus();
});
elements.syncButton.addEventListener("click", () => {
  if (!supabaseClient) {
    showToast("Sync is still loading. Try again in a moment.");
    return;
  }
  if (cloudUser) {
    elements.settingsDialog.showModal();
  } else {
    openAuthDialog();
  }
});
elements.cloudAuthButton.addEventListener("click", handleCloudAuthButton);
elements.sharePrimaryButton.addEventListener("click", handleSharePrimary);
elements.shareStopButton.addEventListener("click", stopPublicSharing);
elements.authForm.addEventListener("submit", sendMagicLink);
document.querySelector("#closeAuthButton").addEventListener("click", () => {
  elements.authDialog.close();
});
elements.connectBackupButton.addEventListener("click", async () => {
  await backupReadyPromise;
  const connected = await chooseBackupFile();
  if (connected) showToast("Backup ready.");
});
document.querySelector("#closeSettingsButton").addEventListener("click", () => {
  elements.settingsDialog.close();
});
document.querySelector("#resetButton").addEventListener("click", resetChallenge);

elements.dayDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  requestCloseDayDialog();
});

elements.dayDialog.addEventListener("click", (event) => {
  if (event.target === elements.dayDialog) requestCloseDayDialog();
});

elements.dayDialog.addEventListener("close", () => {
  hideDayClosePrompt({ restoreFocus: false });
  dayDraftBaseline = null;
});

window.addEventListener("beforeunload", (event) => {
  if (!hasUnsavedDayChanges()) return;
  event.preventDefault();
  event.returnValue = "";
});

window.addEventListener("online", () => {
  if (cloudUser) queueCloudSync();
});

[elements.checkinDialog, elements.settingsDialog, elements.authDialog].forEach((dialog) => {
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
});

if (isSharedView) {
  document.body.classList.add("shared-view");
  elements.sharedBanner.hidden = false;
}
render();
backupReadyPromise = isSharedView
  ? Promise.resolve(false)
  : initAutomaticBackup();
cloudReadyPromise = initCloudSync();
if (didMigrateOnLoad && !isSharedView) {
  backupReadyPromise.then(() =>
    syncAutomaticBackup({ allowSetup: false }),
  );
}
