// The real kiosk flow on the mainland, and the name and message fields shared with the Factory's glass. The fields are
// hidden: they only take the typing (and a phone's keyboard), which both kiosks draw on their own screens.
(() => {
  "use strict";
  const BL = window.BL;
  const create = (game) => {
    const dialog = document.getElementById("donation-popup"), canvas = document.getElementById("donation-screen");
    const fields = document.getElementById("donation-fields"), dock = document.getElementById("factory-donation-fields");
    const handle = document.getElementById("donation-handle"), message = document.getElementById("donation-message"), closeButton = document.getElementById("donation-close");
    const status = document.getElementById("donation-details-status");
    const context = canvas.getContext("2d"), donations = BL.donations;
    let flow = null, fieldFlow = null, frame = 0, previous = 0, clock = 0, saveTimer = 0;
    // What is typed, for the kiosk to draw: both fields' text, which has the focus, its selection and the message's
    // longest. Updated on the fields' events, never polled.
    const typed = { handle: "", message: "", field: null, start: 0, end: 0, max: message.maxLength };
    // The characters a donation carries (donations.sanitize's), kept as they are typed so the screen shows what is
    // sent, the caret kept where it was; the name also loses a leading @, which the screen draws itself.
    const NOT_CARRIED = /[^\w .,!?'@#:-]/g;
    const carried = (input, text) => {
      const kept = text.replace(NOT_CARRIED, "");
      return input === handle ? kept.replace(/^@+/, "") : kept;
    };
    const keepCarried = (input) => {
      const value = input.value, next = carried(input, value);
      if (next === value) return;
      const at = carried(input, value.slice(0, Number.isInteger(input.selectionStart) ? input.selectionStart : value.length)).length;
      input.value = next;
      input.setSelectionRange(at, at);
    };
    const track = () => {
      const active = document.activeElement, field = active === handle ? handle : active === message ? message : null;
      typed.handle = handle.value; typed.message = message.value;
      typed.field = field === handle ? "handle" : field === message ? "message" : null;
      typed.start = field ? field.selectionStart : 0; typed.end = field ? field.selectionEnd : 0;
      if (fieldFlow) fieldFlow.typed();
    };
    const cleanDetails = (handle, message) => ({
      handle: donations.sanitize(handle, donations.HANDLE_MAX).replace(/^@+/, "").trim() || "anon",
      message: donations.sanitize(message, donations.MESSAGE_MAX)
    });
    const defaults = () => cleanDetails(BL.net.state.me?.login || "anon", game.state.message);
    const details = () => cleanDetails(handle.value, message.value);
    const detailsState = (owner) => {
      if (fieldFlow !== owner) return;
      const paid = owner.state === "paid", hasInvoice = !!owner.invoice;
      handle.disabled = message.disabled = paid;
      if (paid) { clearTimeout(saveTimer); saveTimer = 0; }
      status.textContent = owner.detailsSaving ? "Saving changes…" : owner.detailsError
        || (owner.detailsDirty ? "Changes save automatically…" : hasInvoice ? "Details saved" : "");
    };
    const attachDetails = (owner, value, factory = false) => {
      fieldFlow = owner;
      handle.value = value.handle; message.value = value.message;
      if (factory) dock.append(fields);
      else dialog.insertBefore(fields, dialog.querySelector(".help"));
      dock.hidden = !factory;
      track();
      detailsState(owner);
    };
    const detachDetails = (owner) => {
      if (fieldFlow !== owner) return;
      if (saveTimer) save();
      fieldFlow = null;
      dock.hidden = true;
      dialog.insertBefore(fields, dialog.querySelector(".help"));
    };
    // Puts the typing in the name, all of it selected to type over, or the message, the caret at its end; with null,
    // takes it out of both.
    const focusDetails = (field = "handle") => {
      if (!field) {
        const active = document.activeElement;
        if (active === handle || active === message) active.blur();
        // The mainland popup keeps the keys: its canvas takes the focus back, as a click on it would.
        if (flow && fieldFlow === flow && dialog.open) canvas.focus({ preventScroll: true });
        return;
      }
      const input = field === "message" ? message : handle;
      input.focus({ preventScroll: true });
      if (input === handle) input.select();
      else input.setSelectionRange(input.value.length, input.value.length);
      track();
    };
    // The details the invoice holds back in the fields, after a save the visitor gave up on.
    const restoreDetails = (value) => {
      clearTimeout(saveTimer); saveTimer = 0;
      handle.value = value.handle; message.value = value.message;
      track();
      if (fieldFlow) fieldFlow.detailsChanged();
    };
    const save = () => {
      clearTimeout(saveTimer); saveTimer = 0;
      // A blur on the way to KEEP SAVED must not retry first. Only a new edit or an explicit retry clears an error.
      return fieldFlow && !fieldFlow.detailsError ? fieldFlow.saveDetails() : Promise.resolve({});
    };
    const changed = () => {
      if (!fieldFlow) return;
      keepCarried(handle);
      keepCarried(message);
      track();
      fieldFlow.detailsChanged();
      clearTimeout(saveTimer); saveTimer = 0;
      if (fieldFlow.invoice && fieldFlow.state !== "paid") saveTimer = setTimeout(save, 350);
    };
    // In the fields, Enter goes from the name to the message and, from the message, finishes like the screen's DONE;
    // Escape finishes too, and Tab or Shift+Tab goes between the two. They are out of the page's tab order
    // (tabindex -1), so the typing reaches them only with the details screen up. Their keys never reach the page behind.
    const fieldsKey = (event) => {
      event.stopPropagation();
      if (event.isComposing) return;
      const editing = !!fieldFlow && fieldFlow.state === "details";
      if (event.key === "Tab" && editing) {
        event.preventDefault();
        return focusDetails(event.target === handle ? "message" : "handle");
      }
      if (event.key !== "Enter" && event.key !== "Escape") return;
      event.preventDefault();
      if (!editing) save();
      else if (event.key === "Enter" && event.target === handle) focusDetails("message");
      else fieldFlow.key({ key: event.key });
    };
    fields.addEventListener("input", changed);
    fields.addEventListener("change", save);
    fields.addEventListener("keydown", fieldsKey);
    // The caret and the focus move without input: the screen follows them.
    for (const type of ["keyup", "select", "focusin", "focusout"]) fields.addEventListener(type, track);
    const close = () => {
      cancelAnimationFrame(frame); frame = 0;
      if (flow) flow.stop();
      flow = null;
      if (dialog.open) dialog.close();
    };
    const draw = (now) => {
      frame = 0;
      if (!dialog.open || !flow) return;
      const dt = Math.min(0.1, Math.max(0, (now - previous) / 1000));
      previous = now; clock += dt;
      flow.update(dt);
      if (!flow || !dialog.open) return;
      flow.paint();
      context.drawImage(flow.canvas, 0, 0);
      flow.animate(context, clock);
      frame = requestAnimationFrame(draw);
    };
    const open = () => {
      if (dialog.open) return;
      flow = BL.factoryKiosk.create({
        real: true, outerClose: true, link: () => location.origin + "/lightning",
        startDetails: () => attachDetails(flow, defaults()), details, editDetails: focusDetails, typing: () => typed, restoreDetails,
        closeDetails: () => detachDetails(flow), detailsState,
        invoice: (sats, value) => donations.invoice({ sats, ...value }),
        note: (request, value, changedHandle) => donations.note(request, value.message, changedHandle ? value.handle : undefined),
        onchain: (request) => donations.onchain(request), waitFor: donations.waitFor,
        open: () => donations.state.open, testNetwork: () => donations.testNetwork,
        limits: () => donations.state.limits,
        rate: () => BL.donationRate?.current || donations.state.tally?.rate,
        watchRate: () => BL.donationRate?.watch(),
        bananasFor: BL.game.bananasFor,
        copy: (text) => { if (navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {}); },
        close, watch: close, release: close
      });
      flow.start();
      flow.key({ key: "Enter" });
      if (document.pointerLockElement) document.exitPointerLock();
      dialog.showModal();
      canvas.focus({ preventScroll: true });
      previous = performance.now(); clock = 0;
      frame = requestAnimationFrame(draw);
    };
    const key = (event) => {
      if (event.target === message || event.target === handle || event.metaKey || event.ctrlKey || event.altKey || event.isComposing || event.key === "Tab") return;
      if (!flow || event.target === closeButton) return;
      if (event.key.length === 1 || ["Enter", "Escape", "Backspace", "Delete"].includes(event.key)) {
        event.preventDefault(); event.stopPropagation();
        flow.key(event);
      }
    };
    const tap = (event) => {
      if (!flow) return;
      const rect = canvas.getBoundingClientRect();
      canvas.focus({ preventScroll: true });
      flow.tap((event.clientX - rect.left) * canvas.width / rect.width, (event.clientY - rect.top) * canvas.height / rect.height);
    };
    const cancel = (event) => { event.preventDefault(); close(); };
    dialog.addEventListener("keydown", key);
    dialog.addEventListener("cancel", cancel);
    closeButton.addEventListener("click", close);
    canvas.addEventListener("click", tap);
    const receive = (donation, bananas) => {
      if (!flow || !flow.receive(donation.id, bananas, donation.handle, donation.sats)) return false;
      // Show the delivery in the visitor's current scene as soon as the payment settles.
      close();
      return true;
    };
    const seen = (id, sats, due, left, pricing) => !!flow && flow.seen(id, sats, due, left, pricing);
    const dispose = () => {
      close();
      if (fieldFlow) detachDetails(fieldFlow);
      dialog.removeEventListener("keydown", key); dialog.removeEventListener("cancel", cancel);
      fields.removeEventListener("input", changed); fields.removeEventListener("change", save);
      fields.removeEventListener("keydown", fieldsKey);
      for (const type of ["keyup", "select", "focusin", "focusout"]) fields.removeEventListener(type, track);
      closeButton.removeEventListener("click", close); canvas.removeEventListener("click", tap);
    };
    return { open, close, receive, seen, dispose, defaults, details, typing: () => typed, restoreDetails, focusDetails, attachDetails, detachDetails, detailsState };
  };
  BL.donationPopup = { create };
})();
