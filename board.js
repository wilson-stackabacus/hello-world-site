// Board view: thread list for a board + "new thread" form.
import {
  renderHeader, updateAuthControl, watchAuth, isConfigured, auth,
  db, doc, getDoc, collection, getDocs, query, where,
  createThread, compressImage, saveImage, fmtDateTime, h
} from "./common.js";

const app = document.getElementById("app");
renderHeader();

const params = new URLSearchParams(location.search);
const boardId = params.get("board");

let currentUser = null;
watchAuth((user) => { currentUser = user; updateAuthControl(user); });

const heading = h("h2", { text: "Board" });
const threadsBox = h("div");
const formBox = h("div");
app.append(heading, h("p", {}, h("a", { href: "index.html", text: "« all boards" })), formBox, h("hr"), h("h3", { text: "Threads" }), threadsBox);

async function loadBoard() {
  if (!isConfigured) return;
  if (!boardId) { app.append(h("p", { text: "No board specified." })); return; }
  const bs = await getDoc(doc(db, "boards", boardId));
  if (!bs.exists()) { heading.textContent = "Board not found"; return; }
  const board = bs.data();
  heading.replaceChildren(h("span", { class: "rainbow", text: board.name || boardId }));
  if (board.description) heading.append(" — " + board.description);
  renderForm();
  await loadThreads();
}

function renderForm() {
  formBox.replaceChildren();
  formBox.append(h("h3", { text: "Start a new thread" }));
  const title = h("input", { type: "text", placeholder: "Title", maxlength: "200" });
  const text = h("textarea", { rows: "4", cols: "50", placeholder: "Opening post text" });
  const file = h("input", { type: "file", accept: "image/*" });
  const status = h("span");
  const submit = h("button", { text: "Post thread", onClick: () => doPost() });
  formBox.append(
    h("p", {}, title), h("p", {}, text),
    h("p", {}, "Optional image: ", file),
    h("p", {}, submit, " ", status)
  );

  async function doPost() {
    if (!title.value.trim()) { status.textContent = "Title is required."; return; }
    submit.disabled = true; status.textContent = "Posting…";
    try {
      let imageId = null;
      if (file.files && file.files[0]) {
        status.textContent = "Compressing image…";
        const dataUrl = await compressImage(file.files[0]);
        imageId = await saveImage(dataUrl);
      }
      const id = await createThread({
        boardId,
        title: title.value.trim(),
        text: text.value,
        authorUid: currentUser ? currentUser.uid : null,
        authorName: currentUser ? (currentUser.displayName || "user") : "Anonymous",
        imageId,
      });
      location.href = "thread.html?id=" + encodeURIComponent(id);
    } catch (e) {
      status.textContent = "Error: " + e.message;
      submit.disabled = false;
    }
  }
}

async function loadThreads() {
  threadsBox.replaceChildren("Loading…");
  const snap = await getDocs(query(collection(db, "threads"), where("boardId", "==", boardId)));
  const threads = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => ms(b.lastBumpAt) - ms(a.lastBumpAt));
  threadsBox.replaceChildren();
  if (threads.length === 0) { threadsBox.append(h("p", { text: "No threads yet. Be the first." })); return; }
  const ul = h("ul");
  for (const t of threads) {
    ul.append(h("li", {},
      h("a", { href: "thread.html?id=" + encodeURIComponent(t.id), text: t.title || "(untitled)" }),
      ` — ${t.replyCount || 0} replies · by ${t.authorName || "Anonymous"} · ${fmtDateTime(t.createdAt)}`,
      t.imageId ? " [has image]" : ""
    ));
  }
  threadsBox.append(ul);
}

function ms(ts) { return ts && ts.toDate ? ts.toDate().getTime() : 0; }

loadBoard().catch((e) => app.append(h("p", { text: "Error: " + e.message })));