import fs from "fs";
import path from "path";
import {
  tasks,
  statuses,
  phases,
  priorities,
  categories,
  clientAssets,
  launchChecklist,
  phaseDeliverables,
  scopeItems,
  teamMembers
} from "../src/data/trackerData.js";

const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const secretRegex = /(password|api\s*key|api\s*secret|api\s*token|credential|private\s*key)/i;
const jwtRegex = /eyJ[a-zA-Z0-9-_=]+\.eyJ[a-zA-Z0-9-_=]+\.[a-zA-Z0-9-_=]+/g;
const bannedNames = ["BHP", "Harmony", "RB Plats", "Tranter", "Ingwe"];

const errors = [];

function addError(message) {
  errors.push(message);
}

// 1. ID uniqueness check
const seenIds = new Set();

function checkId(id, context) {
  if (!id) {
    addError(`Missing ID in ${context}`);
    return;
  }
  if (seenIds.has(id)) {
    addError(`Duplicate ID "${id}" found in ${context}`);
  }
  seenIds.add(id);
}

// 2. Constants validation
function checkEnum(value, allowedList, fieldName, context) {
  if (!allowedList.includes(value)) {
    addError(`Invalid value "${value}" for field "${fieldName}" in ${context}. Allowed values: [${allowedList.join(", ")}]`);
  }
}

// 3. Confidentiality scan
function checkConfidentiality(obj, contextPath) {
  if (typeof obj === "string") {
    if (emailRegex.test(obj)) {
      addError(`Confidentiality failure at ${contextPath}: Contains email address format in "${obj}"`);
    }
    if (secretRegex.test(obj)) {
      addError(`Confidentiality failure at ${contextPath}: Contains secret/credential keyword in "${obj}"`);
    }
    for (const name of bannedNames) {
      const regex = new RegExp(`\\b${name.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&")}\\b`, "i");
      if (regex.test(obj)) {
        addError(`Confidentiality failure at ${contextPath}: Contains banned third-party name "${name}" in "${obj}"`);
      }
    }
  } else if (Array.isArray(obj)) {
    obj.forEach((item, index) => {
      checkConfidentiality(item, `${contextPath}[${index}]`);
    });
  } else if (typeof obj === "object" && obj !== null) {
    for (const key of Object.keys(obj)) {
      checkConfidentiality(obj[key], `${contextPath}.${key}`);
    }
  }
}

// Validate Tasks
tasks.forEach((task, index) => {
  const context = `tasks[${index}] (${task.id || 'no-id'})`;
  checkId(task.id, context);
  
  // Required fields
  const requiredFields = ["id", "task", "category", "phase", "responsible", "status", "priority", "clientInput", "notes", "nextAction"];
  requiredFields.forEach((field) => {
    if (task[field] === undefined || task[field] === null) {
      addError(`Missing required field "${field}" in ${context}`);
    }
  });

  // Enums
  if (task.status) checkEnum(task.status, statuses, "status", context);
  if (task.phase) checkEnum(task.phase, phases, "phase", context);
  if (task.priority) checkEnum(task.priority, priorities, "priority", context);
  if (task.category) checkEnum(task.category, categories, "category", context);
  if (task.responsible) checkEnum(task.responsible, teamMembers, "responsible", context);

  // Scan confidentiality
  checkConfidentiality(task, `tasks[${index}]`);
});

// Validate Client Assets
clientAssets.forEach((asset, index) => {
  const context = `clientAssets[${index}] (${asset.id || 'no-id'})`;
  checkId(asset.id, context);

  const requiredFields = ["id", "asset", "requirement", "status", "responsible", "notes"];
  requiredFields.forEach((field) => {
    if (asset[field] === undefined || asset[field] === null) {
      addError(`Missing required field "${field}" in ${context}`);
    }
  });

  checkEnum(asset.requirement, ["Required", "Optional"], "requirement", context);
  checkEnum(asset.status, statuses, "status", context);
  if (asset.responsible && asset.responsible !== "Jazmin" && asset.responsible !== "Client Team" && asset.responsible !== "Embark Digitals") {
    checkEnum(asset.responsible, teamMembers, "responsible", context);
  }

  checkConfidentiality(asset, `clientAssets[${index}]`);
});

// Validate Launch Checklist
launchChecklist.forEach((item, index) => {
  const context = `launchChecklist[${index}] (${item.id || 'no-id'})`;
  checkId(item.id, context);

  const requiredFields = ["id", "item", "status", "owner", "priority"];
  requiredFields.forEach((field) => {
    if (item[field] === undefined || item[field] === null) {
      addError(`Missing required field "${field}" in ${context}`);
    }
  });

  checkEnum(item.status, statuses, "status", context);
  checkEnum(item.priority, priorities, "priority", context);
  if (item.owner && item.owner !== "Client Team" && item.owner !== "Embark Digitals") {
    checkEnum(item.owner, teamMembers, "owner", context);
  }

  checkConfidentiality(item, `launchChecklist[${index}]`);
});

// Validate Phase Deliverables
phaseDeliverables.forEach((item, index) => {
  const context = `phaseDeliverables[${index}] (${item.id || 'no-id'})`;
  checkId(item.id, context);

  const requiredFields = ["id", "title", "description", "included", "notIncluded", "status", "notes", "clientInput"];
  requiredFields.forEach((field) => {
    if (item[field] === undefined || item[field] === null) {
      addError(`Missing required field "${field}" in ${context}`);
    }
  });

  checkEnum(item.status, statuses, "status", context);
  checkConfidentiality(item, `phaseDeliverables[${index}]`);
});

// Validate Scope Items
scopeItems.forEach((group, index) => {
  checkConfidentiality(group, `scopeItems[${index}]`);
});

// 4. Code Bundle Audit: scan all source files in src/ for committed JWTs or service_role credentials
function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach((f) => {
    const dirPath = path.join(dir, f);
    const isDirectory = fs.statSync(dirPath).isDirectory();
    if (isDirectory) {
      walkDir(dirPath, callback);
    } else {
      callback(dirPath);
    }
  });
}

const srcDir = path.resolve("./src");
if (fs.existsSync(srcDir)) {
  walkDir(srcDir, (filePath) => {
    // Only scan text source files
    if (/\.(jsx|js|ts|tsx|css|html)$/.test(filePath)) {
      const content = fs.readFileSync(filePath, "utf8");
      
      // Check for committed JWTs
      if (jwtRegex.test(content)) {
        addError(`Safety failure: Hardcoded JWT token found in source file: ${filePath}`);
      }

      // Check for committed service_role key variables
      // (avoid finding this regex string in validate-data.mjs by looking for service_role variable usage)
      if (content.includes("service_role") && !filePath.endsWith("validate-data.mjs")) {
        addError(`Safety failure: "service_role" keyword found in source file: ${filePath}`);
      }
    }
  });
}

// Final check
if (errors.length > 0) {
  console.error("Data contract and safety validation FAILED:");
  errors.forEach((err) => console.error(`- ${err}`));
  process.exit(1);
} else {
  console.log("Data contract and safety validation PASSED successfully!");
  process.exit(0);
}
