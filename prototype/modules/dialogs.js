const root = () => document.querySelector("#modal-root");

export function closeDialog() {
  root().replaceChildren();
}

export function openDialog({ title, description = "", fields = [], confirmLabel = "确认", danger = false, onConfirm }) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `<section class="prototype-dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
    <header><div><h2 id="dialog-title">${title}</h2>${description ? `<p>${description}</p>` : ""}</div><button type="button" data-close-dialog aria-label="关闭">×</button></header>
    <form><div class="dialog-fields">${fields.map((field) => `<label><span>${field.label}</span>${field.type === "select" ? `<select name="${field.name}">${field.options.map((option) => `<option>${option}</option>`).join("")}</select>` : `<input name="${field.name}" type="${field.type || "text"}" value="${field.value || ""}" placeholder="${field.placeholder || ""}" ${field.required === false ? "" : "required"}>`}</label>`).join("")}</div>
      <footer><button type="button" class="dialog-secondary" data-close-dialog>取消</button><button type="submit" class="dialog-primary ${danger ? "danger" : ""}">${confirmLabel}</button></footer>
    </form></section>`;
  root().append(overlay);
  const form = overlay.querySelector("form");
  overlay.querySelectorAll("[data-close-dialog]").forEach((button) => button.addEventListener("click", closeDialog));
  overlay.addEventListener("pointerdown", (event) => { if (event.target === overlay) closeDialog(); });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form));
    const result = await onConfirm?.(values);
    if (result !== false) closeDialog();
  });
  overlay.querySelector("input, select")?.focus();
}
