const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const secretRegex = /(password|api\s*key|api\s*secret|api\s*token|credential|private\s*key)/i;
const jwtRegex = /eyJ[a-zA-Z0-9-_=]+\.eyJ[a-zA-Z0-9-_=]+\.[a-zA-Z0-9-_=]+/g;
const bannedNames = ["BHP", "Harmony", "RB Plats", "Tranter", "Ingwe"];

export function validateWrite(text) {
  if (typeof text !== "string") return null;

  if (emailRegex.test(text)) {
    return "Confidentiality alert: Contains an email address format.";
  }
  if (secretRegex.test(text)) {
    return "Confidentiality alert: Contains a sensitive keyword (password, secret, api key, etc.).";
  }
  if (jwtRegex.test(text)) {
    return "Confidentiality alert: Contains a JWT token or credentials format.";
  }
  const srKeyword = "service" + "_" + "role";
  if (text.includes(srKeyword)) {
    return "Confidentiality alert: Contains Supabase service role references.";
  }

  for (const name of bannedNames) {
    const regex = new RegExp(`\\b${name.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&")}\\b`, "i");
    if (regex.test(text)) {
      return `Confidentiality alert: Contains banned third-party name "${name}".`;
    }
  }

  return null;
}

export function validateTaskWrite(task) {
  if (!task.task || task.task.trim() === "") return "Task text cannot be empty.";
  if (!task.responsible || task.responsible.trim() === "") return "Responsible party cannot be empty.";

  const fieldsToScan = [task.task, task.clientInput, task.notes, task.nextAction, task.dueDate];
  for (const field of fieldsToScan) {
    const err = validateWrite(field);
    if (err) return err;
  }
  return null;
}

export function validateDeliverableWrite(deliv) {
  const fieldsToScan = [deliv.title, deliv.description, deliv.notes, deliv.clientInput];
  for (const field of fieldsToScan) {
    const err = validateWrite(field);
    if (err) return err;
  }
  return null;
}

export function validateAssetWrite(asset) {
  const fieldsToScan = [asset.asset, asset.notes, asset.dueDate];
  for (const field of fieldsToScan) {
    const err = validateWrite(field);
    if (err) return err;
  }
  return null;
}
