const STORAGE_KEY = "arm32.challenge.v1";
const DATA_VERSION = 3;
const CHALLENGE_DAYS = 28;
const BACKUP_DB_NAME = "arm32.file-backup";
const BACKUP_STORE_NAME = "handles";
const BACKUP_HANDLE_KEY = "primary";
const MUSCLE_GROUPS = ["Triceps", "Biceps"];
const CHECKIN_DAYS = [1, 7, 14, 21, 28];
const CHECKIN_LABELS = ["Baseline", "Week 1", "Week 2", "Week 3", "Final"];

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
  startedAt: null,
  days: {},
  checkins: {},
});

let didMigrateOnLoad = false;
let state = loadState();
let activeDay = 1;
let activeCheckinDay = 1;
let draftGroups = createGroups();
let draftLocation = "gym";
let dayDraftBaseline = null;
let draftPhoto = null;
let toastTimer;
let backupHandle = null;
let backupReadyPromise;
let lastBackupSynced = false;
let restTimerStartedAt = null;
let restTimerInterval = null;
let restTimerDay = null;

const elements = {
  dayGrid: document.querySelector("#dayGrid"),
  checkinGrid: document.querySelector("#checkinGrid"),
  dayDialog: document.querySelector("#dayDialog"),
  dayDialogTitle: document.querySelector("#dayDialogTitle"),
  dayDialogEyebrow: document.querySelector("#dayDialogEyebrow"),
  tricepsSetList: document.querySelector("#tricepsSetList"),
  bicepsSetList: document.querySelector("#bicepsSetList"),
  loggedTricepsCount: document.querySelector("#loggedTricepsCount"),
  loggedBicepsCount: document.querySelector("#loggedBicepsCount"),
  loggedRepsCount: document.querySelector("#loggedRepsCount"),
  loggedVolumeCount: document.querySelector("#loggedVolumeCount"),
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
  armChange: document.querySelector("#armChange"),
  armChangeUnit: document.querySelector("#armChangeUnit"),
  currentDayStat: document.querySelector("#currentDayStat"),
  challengeDate: document.querySelector("#challengeDate"),
  todayButton: document.querySelector("#todayButton"),
  todayButtonLabel: document.querySelector("#todayButtonLabel"),
  checkinDialog: document.querySelector("#checkinDialog"),
  checkinDialogTitle: document.querySelector("#checkinDialogTitle"),
  leftArmInput: document.querySelector("#leftArmInput"),
  rightArmInput: document.querySelector("#rightArmInput"),
  noteInput: document.querySelector("#noteInput"),
  photoInput: document.querySelector("#photoInput"),
  photoPreview: document.querySelector("#photoPreview"),
  photoPrompt: document.querySelector("#photoPrompt"),
  settingsDialog: document.querySelector("#settingsDialog"),
  backupStatus: document.querySelector("#backupStatus"),
  connectBackupButton: document.querySelector("#connectBackupButton"),
  toast: document.querySelector("#toast"),
};

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
    startedAt: saved.startedAt || null,
    checkins: remapCheckins(saved.checkins),
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

async function persist({ allowBackupSetup = true } = {}) {
  lastBackupSynced = false;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    showToast("Storage full. Export a backup and use smaller photos.");
    return false;
  }

  lastBackupSynced = await syncAutomaticBackup({ allowSetup: allowBackupSetup });
  return true;
}

function setBackupStatus(status, message) {
  elements.backupStatus.dataset.state = status;
  elements.backupStatus.querySelector("span").textContent = message;
  elements.connectBackupButton.textContent =
    status === "connected" ? "Change backup file" : "Connect automatic backup";
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
    setBackupStatus("attention", "Automatic file backup is unavailable in this browser.");
    elements.connectBackupButton.disabled = true;
    return;
  }

  try {
    backupHandle = await getStoredBackupHandle();
    if (!backupHandle) {
      setBackupStatus("idle", "Not connected · first save will ask for a file");
      return;
    }

    const permission = await backupHandle.queryPermission({ mode: "readwrite" });
    setBackupStatus(
      permission === "granted" ? "connected" : "attention",
      permission === "granted"
        ? `Automatic backup connected · ${backupHandle.name}`
        : `Permission needed · ${backupHandle.name}`,
    );
  } catch (error) {
    backupHandle = null;
    setBackupStatus("idle", "Not connected · first save will ask for a file");
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
    setBackupStatus("connected", `Automatic backup connected · ${handle.name}`);
    return true;
  } catch (error) {
    if (error?.name !== "AbortError") {
      console.warn("Could not connect backup file.", error);
      setBackupStatus("attention", "Backup connection failed · try again");
    } else {
      setBackupStatus("idle", "Not connected · data is still saved in this browser");
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
      setBackupStatus("attention", `Permission needed · ${backupHandle.name}`);
      return false;
    }

    await writeBackupFile();
    setBackupStatus("connected", `Automatic backup current · ${backupHandle.name}`);
    return true;
  } catch (error) {
    console.warn("Could not update backup file.", error);
    setBackupStatus("attention", "Local save worked · backup update failed");
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
          <span class="day-delta ${volumeDelta.className}">${stats.sets ? volumeDelta.label : "No data yet"}</span>
        </span>
        <span class="day-metric">
          <small>Reps</small>
          <b>${stats.sets ? formatNumber(stats.reps) : "—"}</b>
          <span class="day-delta ${repsDelta.className}">${stats.sets ? repsDelta.label : "No data yet"}</span>
        </span>
      </span>
      <span class="day-meta">
        <span>${stats.sets ? `${stats.sets}/10 sets` : day === currentDay ? "Log today" : "Open"}</span>
        <span class="day-tick">${completed ? "✓" : partial ? "–" : "↗"}</span>
      </span>
    `;
    button.addEventListener("click", () => openDay(day));
    elements.dayGrid.append(button);
  }
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
    card.addEventListener("click", () => openCheckin(day));
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
  if (
    hasUnsavedDayChanges() &&
    !window.confirm(
      `Discard unsaved changes for day ${activeDay}? Your current workout entries will be lost.`,
    )
  ) {
    return;
  }

  elements.dayDialog.close();
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
        <small>KG / ARM</small>
      </label>
      <span class="reps-control">
        <button type="button" class="rep-step rep-minus" aria-label="Decrease reps" ${set.reps <= 0 ? "disabled" : ""}>−</button>
        <span class="rep-value"><strong>${set.reps}</strong><small>REPS</small></span>
        <button type="button" class="rep-step rep-plus" aria-label="Increase reps" ${set.reps >= 30 ? "disabled" : ""}>+</button>
      </span>
      <span class="set-volume"><strong>${formatNumber(getSetVolume(set))}</strong><small>KG MOVED</small></span>
      <button type="button" class="set-enable" aria-label="${set.logged ? "Remove" : "Log"} ${muscle} set ${index + 1}"></button>
    `;

    const weightInput = row.querySelector(".weight-input");
    const setVolume = row.querySelector(".set-volume strong");
    const enableButton = row.querySelector(".set-enable");

    weightInput.addEventListener("input", (event) => {
      const wasLogged = set.logged;
      set.weight = event.target.value;
      set.logged = Number(set.weight) > 0;
      if (!wasLogged && set.logged) {
        startRestTimer();
      }
      setVolume.textContent = formatNumber(getSetVolume(set));
      row.classList.toggle("logged", set.logged);
      enableButton.setAttribute(
        "aria-label",
        `${set.logged ? "Remove" : "Log"} ${muscle} set ${index + 1}`,
      );
      updateDaySummary();
    });

    row.querySelector(".rep-minus").addEventListener("click", () => {
      set.reps = Math.max(0, set.reps - 1);
      renderSetLists();
    });

    row.querySelector(".rep-plus").addEventListener("click", () => {
      set.reps = Math.min(30, set.reps + 1);
      renderSetLists();
    });

    enableButton.addEventListener("click", () => {
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
    showToast(`Log all 5 ${invalidGroup.toLowerCase()} sets.`);
    return;
  }

  const missingWeight = getLoggedSetsFromGroups(draftGroups).some(
    (set) => Number(set.weight) <= 0,
  );
  if (missingWeight) {
    showToast("Add kg to every logged set.");
    return;
  }

  await storeTrainingDay(true);
}

async function savePartialDay() {
  const logged = getLoggedSetsFromGroups(draftGroups);
  if (!logged.length) {
    showToast("Check at least one performed set.");
    return;
  }

  if (logged.some((set) => Number(set.weight) <= 0)) {
    showToast("Add kg to every checked set.");
    return;
  }

  await storeTrainingDay(isCompleteGroups(draftGroups));
}

async function storeTrainingDay(complete) {
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

  if (!(await persist())) return;
  dayDraftBaseline = getDayDraftSnapshot();
  elements.dayDialog.close();
  render();
  const status = complete ? "saved" : "saved as partial";
  showToast(
    `Day ${String(activeDay).padStart(2, "0")} ${status}${lastBackupSynced ? " + backup updated." : " locally."}`,
  );
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
    showToast("Photo compressed locally.");
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
    updatedAt: new Date().toISOString(),
  };

  if (await persist()) {
    elements.checkinDialog.close();
    render();
    showToast(`Check-in saved${lastBackupSynced ? " + backup updated." : " locally."}`);
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
  delete state.checkins[activeCheckinDay];
  await persist();
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
        ![1, 2, DATA_VERSION].includes(imported.version) ||
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
  localStorage.removeItem(STORAGE_KEY);
  state = emptyState();
  resetRestTimer();
  lastBackupSynced = await syncAutomaticBackup({ allowSetup: false });
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
elements.trainingLocationButtons.forEach((button) => {
  button.addEventListener("click", () => {
    draftLocation = button.dataset.trainingLocation;
    renderTrainingLocation();
  });
});
document.querySelector("#saveCheckinButton").addEventListener("click", saveCheckin);
document.querySelector("#clearCheckinButton").addEventListener("click", clearCheckin);
elements.photoInput.addEventListener("change", (event) => handlePhoto(event.target.files[0]));
document.querySelector("#exportButton").addEventListener("click", exportData);
document.querySelector("#settingsExportButton").addEventListener("click", exportData);
document.querySelector("#importInput").addEventListener("change", (event) => {
  importData(event.target.files[0]);
  event.target.value = "";
});
document.querySelector("#settingsButton").addEventListener("click", () => {
  elements.settingsDialog.showModal();
});
elements.connectBackupButton.addEventListener("click", async () => {
  await backupReadyPromise;
  const connected = await chooseBackupFile();
  if (connected) showToast("Automatic backup connected and current.");
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
  dayDraftBaseline = null;
});

window.addEventListener("beforeunload", (event) => {
  if (!hasUnsavedDayChanges()) return;
  event.preventDefault();
  event.returnValue = "";
});

[elements.checkinDialog, elements.settingsDialog].forEach((dialog) => {
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
});

render();
backupReadyPromise = initAutomaticBackup();
if (didMigrateOnLoad) {
  backupReadyPromise.then(() =>
    syncAutomaticBackup({ allowSetup: false }),
  );
}
