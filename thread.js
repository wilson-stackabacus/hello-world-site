// Thread view: OP + replies, reply form, voting on replies.
import {
  renderHeader, updateAuthControl, watchAuth, isConfigured,
  db, doc, getDoc, collection, getDocs, query, where,
  createPost, castVote, getMyVote, compressImage, saveImage,
  authorBlock, imageElement, fmtDateTime, h
} from "./common.js";

const app = document.getElementById("app");
renderHeader();

const params = new URLSearchParams(location.search);
const threadId = params.get("id");

let currentUser = null;
let thread = null;

const opBox = h("div");
const repliesBox = h("div");
const formBox = h("div");
app.append(opBox, h("hr"), h("h3", { text: "Replies" }), repliesBox, h("hr"), formBox);

// Re-render replies when auth changes so vote buttons enable/disable correctly.
watchAuth((user) => {
  currentUser = user;
  updateAuthControl(user);
  if (isConfigured && thread) { renderForm(); loadReplies(); }
});

async function loadThread() {
  if (!isConfigured) return;
  if (!threadId) { opBox.append(h("p", { text: "No thread specified." })); return; }
  const ts = await getDoc(doc(db, "threads", threadId));
  if (!ts.exists()) { opBox.append(h("p", { text: "Thread not found." })); return; }
  thread = { id: ts.id, ...ts.data() };
  await renderOp();
  renderForm();
  await loadReplies();
}

async function renderOp() {
  opBox.replaceChildren();
  opBox.append(
    h("p", {}, h("a", { href: "board.html?board=" + encodeURIComponent(thread.boardId), text: "« /" + thread.boardId + "/" })),
    h("h2", {}, h("span", { class: "rainbow", text: thread.title || "(untitled)" }))
  );
  const meta = h("p", {}, "by ");
  meta.append(await authorBlock(thread.authorUid, thread.authorName));
  meta.append(" · " + fmtDateTime(thread.createdAt));
  opBox.append(meta);
  if (thread.opText) opBox.append(h("p", { text: thread.opText }));
  const img = await imageElement(thread.imageId);
  if (img) opBox.append(h("p", {}, img));
}

async function loadReplies() {
  repliesBox.replaceChildren("Loading…");
  const snap = await getDocs(query(collection(db, "posts"), where("threadId", "==", threadId)));
  const posts = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => ms(a.createdAt) - ms(b.createdAt));
  repliesBox.replaceChildren();
  if (posts.length === 0) { repliesBox.append(h("p", { text: "No replies yet." })); return; }
  for (const p of posts) repliesBox.append(await renderPost(p));
}

async function renderPost(p) {
  const wrap = h("div");
  const meta = h("p", {});
  meta.append(await authorBlock(p.authorUid, p.authorName));
  meta.append(" · " + fmtDateTime(p.createdAt));
  wrap.append(meta);
  if (p.text) wrap.append(h("p", { text: p.text }));
  const img = await imageElement(p.imageId);
  if (img) wrap.append(h("p", {}, img));

  // Voting row.
  const scoreSpan = h("span", { text: `score ${p.score || 0} (▲${p.upvotes || 0} / ▼${p.downvotes || 0})` });
  const row = h("p", {});
  if (currentUser) {
    const myVote = await getMyVote(p.id, currentUser.uid);
    const up = h("button", { text: myVote === 1 ? "▲ upvoted" : "▲ upvote", onClick: () => vote(p.id, 1) });
    const down = h("button", { text: myVote === -1 ? "▼ downvoted" : "▼ downvote", onClick: () => vote(p.id, -1) });
    row.append(up, " ", down, " ", scoreSpan);
  } else {
    row.append(scoreSpan, " ", h("small", { text: "(sign in to vote)" }));
  }
  wrap.append(row, h("hr"));
  return wrap;
}

async function vote(postId, value) {
  try { await castVote(postId, value); await loadReplies(); }
  catch (e) { alert("Vote failed: " + e.message); }
}

function renderForm() {
  formBox.replaceChildren();
  formBox.append(h("h3", { text: "Post a reply" }));
  const text = h("textarea", { rows: "4", cols: "50", placeholder: "Reply text" });
  const file = h("input", { type: "file", accept: "image/*" });
  const status = h("span");
  const submit = h("button", { text: "Post reply", onClick: () => doReply() });
  formBox.append(h("p", {}, text), h("p", {}, "Optional image: ", file), h("p", {}, submit, " ", status));

  async function doReply() {
    if (!text.value.trim() && !(file.files && file.files[0])) { status.textContent = "Write something or attach an image."; return; }
    submit.disabled = true; status.textContent = "Posting…";
    try {
      let imageId = null;
      if (file.files && file.files[0]) {
        status.textContent = "Compressing image…";
        const dataUrl = await compressImage(file.files[0]);
        imageId = await saveImage(dataUrl);
      }
      await createPost({
        threadId,
        boardId: thread.boardId,
        text: text.value,
        authorUid: currentUser ? currentUser.uid : null,
        authorName: currentUser ? (currentUser.displayName || "user") : "Anonymous",
        imageId,
      });
      text.value = ""; file.value = ""; status.textContent = "Posted.";
      submit.disabled = false;
      await loadReplies();
    } catch (e) {
      status.textContent = "Error: " + e.message;
      submit.disabled = false;
    }
  }
}

function ms(ts) { return ts && ts.toDate ? ts.toDate().getTime() : 0; }

loadThread().catch((e) => app.append(h("p", { text: "Error: " + e.message })));