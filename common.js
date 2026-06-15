// ===========================================================================
// common.js — shared Firebase init, helpers, and data-access for the forum.
// Imported by every page's module script. Uses the Firebase Web SDK v10 via CDN
// (modular imports). No build step.
// ===========================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, collection, doc, getDoc, getDocs, setDoc, updateDoc,
  query, where, orderBy, limit, serverTimestamp, increment, runTransaction, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

// --- init ------------------------------------------------------------------
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const provider = new GoogleAuthProvider();

// True only once real config values have been filled into firebase-config.js.
export const isConfigured =
  !!firebaseConfig.apiKey && !String(firebaseConfig.apiKey).includes("__FILL");

// Re-export Firestore primitives so pages import everything from common.js.
export {
  collection, doc, getDoc, getDocs, setDoc, updateDoc,
  query, where, orderBy, limit, serverTimestamp, increment, runTransaction, writeBatch,
  signInWithPopup, signOut, onAuthStateChanged
};

// --- tiny DOM helper -------------------------------------------------------
// h('tag', {attrs}, ...children). User-supplied text MUST be passed via the
// `text` attr or as a string child (both use textContent) to avoid HTML/JS
// injection. Use the `html` attr only for trusted, app-controlled markup.
export function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined) continue;
    if (k === "class") e.className = v;
    else if (k === "text") e.textContent = v;
    else if (k === "html") e.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2).toLowerCase(), v);
    else e.setAttribute(k, v);
  }
  for (const kid of kids) {
    if (kid === null || kid === undefined || kid === false) continue;
    e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return e;
}

export function fmtDateTime(ts) {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString();
}
export function fmtDate(ts) {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString();
}

// --- header / nav / auth control ------------------------------------------
export function renderHeader() {
  const app = document.getElementById("app");
  const title = h("h1", {}, h("a", { href: "index.html" }, h("span", { class: "rainbow", text: "hello world forum" })));
  const nav = h("p", {},
    h("a", { href: "index.html", text: "Home" }), " | ",
    h("a", { href: "stats.html", text: "Site Stats" }), " | ",
    h("span", { id: "auth-control" })
  );
  app.append(title, nav, h("hr"));
  if (!isConfigured) {
    app.append(
      h("p", { text: "⚠ Firebase is not configured yet (placeholder firebase-config.js). Browsing, posting, sign-in and voting are disabled until the real config values are filled in." }),
      h("hr")
    );
  }
}

export function updateAuthControl(user) {
  const c = document.getElementById("auth-control");
  if (!c) return;
  c.replaceChildren();
  if (user) {
    c.append(
      "Signed in as ",
      h("a", { href: "profile.html?uid=" + encodeURIComponent(user.uid), text: user.displayName || "me" }),
      " ",
      h("button", { text: "Sign out", onClick: () => signOut(auth) })
    );
  } else {
    c.append(h("button", {
      text: "Sign in with Google",
      onClick: async () => {
        try { await signInWithPopup(auth, provider); }
        catch (e) { alert("Sign-in failed: " + e.message); }
      }
    }));
  }
}

// watchAuth(cb): ensures the user doc exists, then calls cb(user|null) on change.
export function watchAuth(cb) {
  onAuthStateChanged(auth, async (user) => {
    try { if (user) await ensureUserDoc(user); } catch (e) { console.error("ensureUserDoc failed", e); }
    cb(user);
  });
}

// --- meta counters ---------------------------------------------------------
async function bumpMeta(obj) {
  const inc = {};
  for (const k in obj) inc[k] = increment(obj[k]);
  await setDoc(doc(db, "meta", "stats"), inc, { merge: true });
}

// --- users -----------------------------------------------------------------
const userCache = new Map();

export async function getUser(uid) {
  if (!uid) return null;
  if (userCache.has(uid)) return userCache.get(uid);
  const s = await getDoc(doc(db, "users", uid));
  const u = s.exists() ? { uid, ...s.data() } : null;
  userCache.set(uid, u);
  return u;
}

export async function ensureUserDoc(user) {
  const ref = doc(db, "users", user.uid);
  const s = await getDoc(ref);
  if (!s.exists()) {
    await setDoc(ref, {
      displayName: user.displayName || "Anonymous",
      photoURL: user.photoURL || null,
      createdAt: serverTimestamp(),
      threadCount: 0,
      postCount: 0,
      votesCast: 0,
      votesReceived: 0,
      lastActiveAt: serverTimestamp(),
    });
    await bumpMeta({ userCount: 1 });
  } else {
    await updateDoc(ref, { lastActiveAt: serverTimestamp() });
  }
  userCache.delete(user.uid);
}

// One-line stat summary string for a loaded user doc.
export function userStatsLine(u) {
  if (!u) return "";
  return `joined ${fmtDate(u.createdAt)} · threads ${u.threadCount || 0} · posts ${u.postCount || 0} · karma ${u.votesReceived || 0} · votes cast ${u.votesCast || 0}`;
}

// Author name (+ inline stats line beneath, for registered users) as an element.
export async function authorBlock(authorUid, authorName) {
  const wrap = h("span");
  if (authorUid) {
    wrap.append(h("a", { href: "profile.html?uid=" + encodeURIComponent(authorUid), class: "rainbow", text: authorName || "user" }));
    const u = await getUser(authorUid);
    if (u) wrap.append(h("br"), h("small", { text: userStatsLine(u) }));
  } else {
    wrap.append(h("span", { text: authorName || "Anonymous" }));
  }
  return wrap;
}

// --- images (client-side compress -> Firestore images/{id}) ----------------
function readFileAsDataURL(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(new Error("Could not read file"));
    r.readAsDataURL(file);
  });
}
function loadImg(src) {
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error("Not a valid image"));
    i.src = src;
  });
}
function estBytes(dataUrl) {
  const i = dataUrl.indexOf(",");
  const b64 = i >= 0 ? dataUrl.slice(i + 1) : dataUrl;
  return Math.ceil(b64.length * 3 / 4);
}

// Resize to <=maxEdge longest side, JPEG at decreasing quality until <=maxBytes.
// Throws a clear error if it cannot get under the limit.
export async function compressImage(file, maxEdge = 1024, quality = 0.7, maxBytes = 700 * 1024) {
  const url = await readFileAsDataURL(file);
  const img = await loadImg(url);
  let w = img.naturalWidth || img.width;
  let hgt = img.naturalHeight || img.height;
  const scale = Math.min(1, maxEdge / Math.max(w, hgt));
  w = Math.max(1, Math.round(w * scale));
  hgt = Math.max(1, Math.round(hgt * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = hgt;
  canvas.getContext("2d").drawImage(img, 0, 0, w, hgt);
  let q = quality;
  let out = canvas.toDataURL("image/jpeg", q);
  while (estBytes(out) > maxBytes && q > 0.3) {
    q = Math.round((q - 0.1) * 10) / 10;
    out = canvas.toDataURL("image/jpeg", q);
  }
  if (estBytes(out) > maxBytes) {
    throw new Error("Image is too large even after compression (" + Math.round(estBytes(out) / 1024) + " KB). Please choose a smaller image.");
  }
  return out;
}

export async function saveImage(dataUrl) {
  const ref = doc(collection(db, "images"));
  await setDoc(ref, { dataUrl, createdAt: serverTimestamp() });
  await bumpMeta({ imageCount: 1 });
  return ref.id;
}

// Returns an <img> element for an imageId, or null.
export async function imageElement(imageId) {
  if (!imageId) return null;
  const s = await getDoc(doc(db, "images", imageId));
  if (!s.exists()) return null;
  return h("img", { src: s.data().dataUrl, alt: "post image" });
}

// --- boards ----------------------------------------------------------------
export const DEFAULT_BOARDS = [
  { slug: "b", name: "/b/ — Random", description: "Anything goes." },
  { slug: "tech", name: "/tech/ — Technology", description: "Computers, code, hardware." },
  { slug: "art", name: "/art/ — Art", description: "Drawings, images, creative work." },
  { slug: "meta", name: "/meta/ — Meta", description: "About this site." },
];

// Seeds the default boards if the boards collection is empty.
export async function ensureBoards() {
  const snap = await getDocs(collection(db, "boards"));
  if (!snap.empty) return;
  const batch = writeBatch(db);
  for (const b of DEFAULT_BOARDS) {
    batch.set(doc(db, "boards", b.slug), {
      name: b.name, slug: b.slug, description: b.description, threadCount: 0, postCount: 0,
    });
  }
  await batch.commit();
}

// --- create thread / post --------------------------------------------------
export async function createThread({ boardId, title, text, authorUid, authorName, imageId }) {
  const batch = writeBatch(db);
  const tRef = doc(collection(db, "threads"));
  batch.set(tRef, {
    boardId,
    title,
    opText: text || "",
    authorUid: authorUid || null,
    authorName: authorName || "Anonymous",
    createdAt: serverTimestamp(),
    lastBumpAt: serverTimestamp(),
    replyCount: 0,
    imageId: imageId || null,
  });
  batch.set(doc(db, "boards", boardId), { threadCount: increment(1), postCount: increment(1) }, { merge: true });
  if (authorUid) batch.set(doc(db, "users", authorUid), { threadCount: increment(1), postCount: increment(1) }, { merge: true });
  batch.set(doc(db, "meta", "stats"), { threadCount: increment(1), postCount: increment(1) }, { merge: true });
  await batch.commit();
  if (authorUid) userCache.delete(authorUid);
  return tRef.id;
}

export async function createPost({ threadId, boardId, text, authorUid, authorName, imageId }) {
  const batch = writeBatch(db);
  const pRef = doc(collection(db, "posts"));
  batch.set(pRef, {
    threadId,
    boardId,
    text: text || "",
    authorUid: authorUid || null,
    authorName: authorName || "Anonymous",
    createdAt: serverTimestamp(),
    imageId: imageId || null,
    score: 0,
    upvotes: 0,
    downvotes: 0,
  });
  batch.set(doc(db, "threads", threadId), { replyCount: increment(1), lastBumpAt: serverTimestamp() }, { merge: true });
  batch.set(doc(db, "boards", boardId), { postCount: increment(1) }, { merge: true });
  if (authorUid) batch.set(doc(db, "users", authorUid), { postCount: increment(1) }, { merge: true });
  batch.set(doc(db, "meta", "stats"), { postCount: increment(1) }, { merge: true });
  await batch.commit();
  if (authorUid) userCache.delete(authorUid);
  return pRef.id;
}

// --- voting (signed-in only, one vote per user per post) -------------------
export async function getMyVote(postId, uid) {
  if (!uid) return 0;
  const s = await getDoc(doc(db, "votes", postId + "_" + uid));
  return s.exists() ? s.data().value : 0;
}

// value must be +1 or -1. Voting the same value again toggles it off.
export async function castVote(postId, value) {
  const user = auth.currentUser;
  if (!user) { alert("Sign in with Google to vote."); return; }
  const voteRef = doc(db, "votes", postId + "_" + user.uid);
  const postRef = doc(db, "posts", postId);
  await runTransaction(db, async (tx) => {
    const ps = await tx.get(postRef);
    if (!ps.exists()) throw new Error("Post no longer exists");
    const authorUid = ps.data().authorUid || null;
    const vs = await tx.get(voteRef);
    let dScore, dUp, dDown, dKarma, dCast;
    if (!vs.exists()) {
      dScore = value; dUp = value > 0 ? 1 : 0; dDown = value < 0 ? 1 : 0; dKarma = value; dCast = 1;
      tx.set(voteRef, { postId, uid: user.uid, value, createdAt: serverTimestamp() });
    } else {
      const prev = vs.data().value;
      if (prev === value) {
        dScore = -value; dUp = value > 0 ? -1 : 0; dDown = value < 0 ? -1 : 0; dKarma = -value; dCast = -1;
        tx.delete(voteRef);
      } else {
        dScore = value - prev;
        dUp = (value > 0 ? 1 : 0) - (prev > 0 ? 1 : 0);
        dDown = (value < 0 ? 1 : 0) - (prev < 0 ? 1 : 0);
        dKarma = value - prev; dCast = 0;
        tx.update(voteRef, { value, createdAt: serverTimestamp() });
      }
    }
    tx.update(postRef, { score: increment(dScore), upvotes: increment(dUp), downvotes: increment(dDown) });
    if (authorUid) tx.set(doc(db, "users", authorUid), { votesReceived: increment(dKarma) }, { merge: true });
    if (dCast !== 0) tx.set(doc(db, "users", user.uid), { votesCast: increment(dCast) }, { merge: true });
  });
  userCache.clear();
}