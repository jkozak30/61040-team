export async function closeDialog(dialog: HTMLDialogElement | undefined) {
  if (!dialog?.open || dialog.hasAttribute("data-closing")) return false;
  dialog.setAttribute("data-closing", "");
  try {
    await Promise.allSettled((dialog.getAnimations?.() ?? []).map((animation) => animation.finished));
    if (dialog.open) dialog.close();
    return true;
  } finally {
    dialog.removeAttribute("data-closing");
  }
}
