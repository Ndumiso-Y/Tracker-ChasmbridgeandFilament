import { useMemo, useState, useEffect } from "react";
import {
  LayoutDashboard,
  FolderKanban,
  ShieldCheck,
  Layers3,
  FileStack,
  Rocket,
  Flag,
  Menu,
  X,
} from "lucide-react";
import inspiration from "./assets/FilamentandChasmInspiration.png";
import { cx } from "./utils/cx";
import { supabase } from "./lib/supabase";
import {
  tasks,
  phaseDeliverables,
  clientAssets,
  launchChecklist,
  scopeItems,
  retainerItems,
  retainerTiers,
  futurePhaseItems
} from "./data/trackerData";
import { validateWrite } from "./utils/validation";

// Import Views
import Dashboard from "./views/Dashboard";
import TaskCommandCenter from "./views/TaskCommandCenter";
import PhaseScope from "./views/PhaseScope";
import LaterPhases from "./views/LaterPhases";
import ClientAssets from "./views/ClientAssets";
import LaunchReadiness from "./views/LaunchReadiness";
import ScopeBoundaries from "./views/ScopeBoundaries";

const navItems = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "tasks", label: "Task Command Center", icon: FolderKanban },
  { id: "scope", label: "Phase 1 Scope", icon: ShieldCheck },
  { id: "later", label: "Retainer / Later Phases", icon: Layers3 },
  { id: "assets", label: "Client Assets", icon: FileStack },
  { id: "launch", label: "Launch Readiness", icon: Rocket },
  { id: "boundaries", label: "Scope Boundaries", icon: Flag },
];

const fallbackAuthors = [
  { id: "ndumiso-embark", display_name: "Ndumiso / Embark Digitals", role_label: "Delivery Owner", organisation_label: "Embark Digitals", is_active: true },
  { id: "dr-rudy-chasm-bridge", display_name: "Dr. Rudy", role_label: "Client Stakeholder", organisation_label: "Chasm Bridge Charity", is_active: true },
  { id: "monique-filament", display_name: "Monique", role_label: "Client Stakeholder", organisation_label: "Filament (Pty) Ltd", is_active: true },
  { id: "jazmin-chasm-bridge", display_name: "Jazmin", role_label: "Client Stakeholder / Role To Be Confirmed", organisation_label: "Chasm Bridge Charity", is_active: true },
];

// Helper functions to map DB records (snake_case) to View models (camelCase)
function mapTaskFromDb(t) {
  return {
    id: t.id,
    task: t.title,
    category: t.category,
    status: t.status,
    clientInput: t.description || "",
    notes: t.notes || "",
    nextAction: t.next_action || "",
    responsible: t.owner_label || "",
    phase: t.phase,
    priority: t.priority || "Medium",
    dueDate: t.due_date || "",
    entity: t.entity || "Both",
  };
}

function mapDeliverableFromDb(d) {
  const staticDel = phaseDeliverables.find(item => item.id === d.id) || {};
  return {
    id: d.id,
    title: d.title,
    description: d.description || "",
    included: staticDel.included || [],
    notIncluded: staticDel.notIncluded || [],
    status: d.status,
    notes: d.notes || "",
    clientInput: d.next_action || "", // clientInput maps to next_action for deliverables
    entity: d.entity || "Both",
  };
}

function mapAssetFromDb(a) {
  return {
    id: a.id,
    asset: a.title,
    requirement: a.priority || "Required", // requirement stored in priority
    status: a.status,
    responsible: a.owner_label || "",
    notes: a.notes || "",
    dueDate: a.due_date || "",
    entity: a.entity || "Both",
  };
}

function mapLaunchItemFromDb(l) {
  return {
    id: l.id,
    item: l.title,
    status: l.status,
    owner: l.owner_label || "",
    priority: l.priority || "Medium",
    entity: l.entity || "Both",
  };
}

function mapRecordByCategoryId(r) {
  const isTask = r.id.startsWith("task-") || r.id.startsWith("social-") || r.id.startsWith("later-");
  const isDeliverable = r.id.startsWith("del-");
  const isAsset = r.id.startsWith("asset-");
  const isLaunchItem = r.id.startsWith("launch-");

  if (isTask) return mapTaskFromDb(r);
  if (isDeliverable) return mapDeliverableFromDb(r);
  if (isAsset) return mapAssetFromDb(r);
  if (isLaunchItem) return mapLaunchItemFromDb(r);
  return null;
}

function App() {
  const [activeView, setActiveView] = useState("dashboard");
  const [mobileOpen, setMobileOpen] = useState(false);

  // DB persistent states (initialized to static data)
  const [dbTasks, setDbTasks] = useState(tasks);
  const [dbDeliverables, setDbDeliverables] = useState(phaseDeliverables);
  const [dbClientAssets, setDbClientAssets] = useState(clientAssets);
  const [dbLaunchItems, setDbLaunchItems] = useState(launchChecklist);
  const [dbScopeItems, setDbScopeItems] = useState(scopeItems);
  const [dbRetainerItems, setDbRetainerItems] = useState(retainerItems);
  const [dbRetainerTiers, setDbRetainerTiers] = useState(retainerTiers);
  const [dbFuturePhaseItems, setDbFuturePhaseItems] = useState(futurePhaseItems);

  // Authors & Notes
  const [dbAuthors, setDbAuthors] = useState(fallbackAuthors);
  const [dbNotes, setDbNotes] = useState([]);

  // Active Editor state
  const [selectedAuthorId, setSelectedAuthorId] = useState("");

  // Role status (admin by default if Supabase is connected)
  const [userRole, setUserRole] = useState(supabase ? "admin" : null);
  const [errorNotification, setErrorNotification] = useState(null);

  const triggerErrorToast = (msg) => {
    setErrorNotification(msg);
    setTimeout(() => {
      setErrorNotification(null);
    }, 6000);
  };

  // 1. Initial Load from Supabase & Postgres Realtime changes
  useEffect(() => {
    if (!supabase) {
      setUserRole(null); // Force read-only viewer mode if Supabase is missing
      return;
    }

    // Load initial data
    async function loadInitialData() {
      try {
        const [
          { data: itemsData, error: iErr },
          { data: authorsData, error: aErr },
          { data: notesData, error: nErr }
        ] = await Promise.all([
          supabase.from("tracker_items").select("*").order("sort_order"),
          supabase.from("update_authors").select("*").order("sort_order"),
          supabase.from("tracker_item_notes").select("*").order("created_at", { ascending: false })
        ]);

        if (iErr) console.warn("Error loading tracker items:", iErr.message);
        if (aErr) console.warn("Error loading update authors:", aErr.message);
        if (nErr) console.warn("Error loading notes/activity:", nErr.message);

        if (itemsData && itemsData.length > 0) {
          const tasksList = [];
          const deliverablesList = [];
          const assetsList = [];
          const checklistList = [];

          itemsData.forEach((item) => {
            const isTask = item.id.startsWith("task-") || item.id.startsWith("social-") || item.id.startsWith("later-");
            const isDeliverable = item.id.startsWith("del-");
            const isAsset = item.id.startsWith("asset-");
            const isLaunchItem = item.id.startsWith("launch-");

            if (isTask) tasksList.push(mapTaskFromDb(item));
            else if (isDeliverable) deliverablesList.push(mapDeliverableFromDb(item));
            else if (isAsset) assetsList.push(mapAssetFromDb(item));
            else if (isLaunchItem) checklistList.push(mapLaunchItemFromDb(item));
          });

          setDbTasks(tasksList);
          setDbDeliverables(deliverablesList);
          setDbClientAssets(assetsList);
          setDbLaunchItems(checklistList);
        }

        if (authorsData && authorsData.length > 0) {
          setDbAuthors(authorsData);
        }

        if (notesData) {
          setDbNotes(notesData);
        }

      } catch (err) {
        console.error("General error loading initial Supabase data:", err);
      }
    }

    loadInitialData();

    // 2. Realtime Postgres Subscriptions
    const channel = supabase
      .channel("schema-db-changes")
      .on("postgres_changes", { event: "*", schema: "public" }, (payload) => {
        const { table, eventType, new: newRecord, old: oldRecord } = payload;
        
        if (table === "tracker_items") {
          if (eventType === "DELETE") {
            const oldId = oldRecord.id;
            setDbTasks(prev => prev.filter(t => t.id !== oldId));
            setDbDeliverables(prev => prev.filter(d => d.id !== oldId));
            setDbClientAssets(prev => prev.filter(a => a.id !== oldId));
            setDbLaunchItems(prev => prev.filter(l => l.id !== oldId));
          } else {
            const mapped = mapRecordByCategoryId(newRecord);
            if (mapped) {
              const isTask = newRecord.id.startsWith("task-") || newRecord.id.startsWith("social-") || newRecord.id.startsWith("later-");
              const isDeliverable = newRecord.id.startsWith("del-");
              const isAsset = newRecord.id.startsWith("asset-");
              const isLaunchItem = newRecord.id.startsWith("launch-");

              if (isTask) {
                setDbTasks(prev => prev.some(t => t.id === mapped.id) ? prev.map(t => t.id === mapped.id ? mapped : t) : [...prev, mapped]);
              } else if (isDeliverable) {
                setDbDeliverables(prev => prev.some(d => d.id === mapped.id) ? prev.map(d => d.id === mapped.id ? mapped : d) : [...prev, mapped]);
              } else if (isAsset) {
                setDbClientAssets(prev => prev.some(a => a.id === mapped.id) ? prev.map(a => a.id === mapped.id ? mapped : a) : [...prev, mapped]);
              } else if (isLaunchItem) {
                setDbLaunchItems(prev => prev.some(l => l.id === mapped.id) ? prev.map(l => l.id === mapped.id ? mapped : l) : [...prev, mapped]);
              }
            }
          }
        }
        else if (table === "tracker_item_notes") {
          if (eventType === "INSERT") {
            setDbNotes(prev => [newRecord, ...prev]);
          } else if (eventType === "UPDATE") {
            setDbNotes(prev => prev.map(n => n.id === newRecord.id ? newRecord : n));
          } else if (eventType === "DELETE") {
            setDbNotes(prev => prev.filter(n => n.id !== oldRecord.id));
          }
        }
        else if (table === "update_authors") {
          if (eventType === "DELETE") {
            setDbAuthors(prev => prev.filter(a => a.id !== oldRecord.id));
          } else {
            setDbAuthors(prev => prev.some(a => a.id === newRecord.id) ? prev.map(a => a.id === newRecord.id ? newRecord : a) : [...prev, newRecord]);
          }
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // 3. Unified inline update handler
  const handleInlineUpdate = async (itemId, updatedFields) => {
    if (!supabase) {
      triggerErrorToast("Supabase is not configured. Cannot save changes.");
      return false;
    }

    if (!selectedAuthorId) {
      triggerErrorToast("Please select who is making this update before saving.");
      return false;
    }

    // Validate inputs for secrets or banned words
    const scanErrors = [];
    Object.values(updatedFields).forEach(val => {
      if (typeof val === "string") {
        const err = validateWrite(val);
        if (err) scanErrors.push(err);
      }
    });

    if (scanErrors.length > 0) {
      triggerErrorToast(scanErrors[0]);
      return false;
    }

    const isTask = itemId.startsWith("task-") || itemId.startsWith("social-") || itemId.startsWith("later-");
    const isDeliverable = itemId.startsWith("del-");
    const isAsset = itemId.startsWith("asset-");
    const isLaunchItem = itemId.startsWith("launch-");

    let oldStatus = "";
    let oldDueDate = "";
    let oldNextAction = "";
    let oldPriority = "";
    let oldResponsible = "";
    let oldNotes = "";

    if (isTask) {
      const t = dbTasks.find(x => x.id === itemId);
      if (t) {
        oldStatus = t.status;
        oldDueDate = t.dueDate;
        oldNextAction = t.nextAction;
        oldPriority = t.priority;
        oldResponsible = t.responsible;
        oldNotes = t.notes;
      }
    } else if (isDeliverable) {
      const d = dbDeliverables.find(x => x.id === itemId);
      if (d) {
        oldStatus = d.status;
        oldNextAction = d.clientInput; // clientInput maps to next_action
        oldNotes = d.notes;
      }
    } else if (isAsset) {
      const a = dbClientAssets.find(x => x.id === itemId);
      if (a) {
        oldStatus = a.status;
        oldDueDate = a.dueDate;
        oldPriority = a.requirement; // requirement stored in priority
        oldResponsible = a.responsible;
        oldNotes = a.notes;
      }
    } else if (isLaunchItem) {
      const l = dbLaunchItems.find(x => x.id === itemId);
      if (l) {
        oldStatus = l.status;
        oldPriority = l.priority;
        oldResponsible = l.owner;
      }
    }

    const author = dbAuthors.find(a => a.id === selectedAuthorId);
    const authorLabel = author ? `${author.display_name} — ${author.organisation_label}` : "Unknown Editor";

    const updateData = {
      updated_at: new Date().toISOString(),
      last_changed_by: authorLabel,
      last_changed_at: new Date().toISOString()
    };

    if (updatedFields.status !== undefined) updateData.status = updatedFields.status;
    if (updatedFields.dueDate !== undefined) updateData.due_date = updatedFields.dueDate || null;
    if (updatedFields.nextAction !== undefined) updateData.next_action = updatedFields.nextAction || null;
    if (updatedFields.priority !== undefined) updateData.priority = updatedFields.priority || null;
    if (updatedFields.responsible !== undefined) updateData.owner_label = updatedFields.responsible || null;
    if (updatedFields.notes !== undefined) updateData.notes = updatedFields.notes || null;
    if (isDeliverable && updatedFields.clientInput !== undefined) {
      updateData.next_action = updatedFields.clientInput || null; // clientInput maps to next_action
    }

    try {
      const { error: updateErr } = await supabase
        .from("tracker_items")
        .update(updateData)
        .eq("id", itemId);

      if (updateErr) throw updateErr;

      // Update local state optimistically
      const localFields = {};
      if (updatedFields.status !== undefined) localFields.status = updatedFields.status;
      if (updatedFields.dueDate !== undefined) localFields.dueDate = updatedFields.dueDate;
      if (updatedFields.nextAction !== undefined) localFields.nextAction = updatedFields.nextAction;
      if (updatedFields.notes !== undefined) localFields.notes = updatedFields.notes;
      if (isDeliverable && updatedFields.clientInput !== undefined) {
        localFields.clientInput = updatedFields.clientInput;
      }
      if (updatedFields.priority !== undefined) {
        if (isAsset) localFields.requirement = updatedFields.priority;
        else localFields.priority = updatedFields.priority;
      }
      if (updatedFields.responsible !== undefined) {
        if (isLaunchItem) localFields.owner = updatedFields.responsible;
        else localFields.responsible = updatedFields.responsible;
      }

      if (isTask) {
        setDbTasks(prev => prev.map(t => t.id === itemId ? { ...t, ...localFields } : t));
      } else if (isDeliverable) {
        setDbDeliverables(prev => prev.map(d => d.id === itemId ? { ...d, ...localFields } : d));
      } else if (isAsset) {
        setDbClientAssets(prev => prev.map(a => a.id === itemId ? { ...a, ...localFields } : a));
      } else if (isLaunchItem) {
        setDbLaunchItems(prev => prev.map(l => l.id === itemId ? { ...l, ...localFields } : l));
      }

      // Construct tracker_item_notes entry
      const notesToInsert = [];

      // 1. Status Change Note
      if (updatedFields.status !== undefined && updatedFields.status !== oldStatus) {
        notesToInsert.push({
          tracker_item_id: itemId,
          note_type: "status_change",
          note_text: null,
          changed_by_author_id: selectedAuthorId,
          changed_by_label: authorLabel,
          old_status: oldStatus,
          new_status: updatedFields.status
        });
      }

      // 2. Due Date Update Note
      if (updatedFields.dueDate !== undefined && updatedFields.dueDate !== oldDueDate) {
        notesToInsert.push({
          tracker_item_id: itemId,
          note_type: "due_date_update",
          note_text: `Due date changed from '${oldDueDate || "None"}' to '${updatedFields.dueDate || "None"}'`,
          changed_by_author_id: selectedAuthorId,
          changed_by_label: authorLabel
        });
      }

      // 3. Next Action Update Note
      if (updatedFields.nextAction !== undefined && updatedFields.nextAction !== oldNextAction) {
        notesToInsert.push({
          tracker_item_id: itemId,
          note_type: "next_action_update",
          note_text: `Next action updated from '${oldNextAction || "None"}' to '${updatedFields.nextAction || "None"}'`,
          changed_by_author_id: selectedAuthorId,
          changed_by_label: authorLabel
        });
      }
      if (isDeliverable && updatedFields.clientInput !== undefined && updatedFields.clientInput !== oldNextAction) {
        notesToInsert.push({
          tracker_item_id: itemId,
          note_type: "next_action_update",
          note_text: `Client input updated from '${oldNextAction || "None"}' to '${updatedFields.clientInput || "None"}'`,
          changed_by_author_id: selectedAuthorId,
          changed_by_label: authorLabel
        });
      }

      // 4. Priority / Requirement Update Note
      if (updatedFields.priority !== undefined && updatedFields.priority !== oldPriority) {
        const fieldName = isAsset ? "Requirement" : "Priority";
        notesToInsert.push({
          tracker_item_id: itemId,
          note_type: "priority_update",
          note_text: `${fieldName} changed from '${oldPriority || "None"}' to '${updatedFields.priority || "None"}'`,
          changed_by_author_id: selectedAuthorId,
          changed_by_label: authorLabel
        });
      }

      // 5. Manual / Notes Update Note
      if (updatedFields.notes !== undefined && updatedFields.notes !== oldNotes) {
        notesToInsert.push({
          tracker_item_id: itemId,
          note_type: "manual",
          note_text: updatedFields.notes,
          changed_by_author_id: selectedAuthorId,
          changed_by_label: authorLabel
        });
      }

      // 6. Responsible party update note (log as manual)
      if (updatedFields.responsible !== undefined && updatedFields.responsible !== oldResponsible) {
        notesToInsert.push({
          tracker_item_id: itemId,
          note_type: "manual",
          note_text: `Responsible party changed from '${oldResponsible || "None"}' to '${updatedFields.responsible || "None"}'`,
          changed_by_author_id: selectedAuthorId,
          changed_by_label: authorLabel
        });
      }

      if (notesToInsert.length > 0) {
        const { data: insertedNotes, error: notesErr } = await supabase
          .from("tracker_item_notes")
          .insert(notesToInsert)
          .select();
        if (notesErr) throw notesErr;

        if (insertedNotes && insertedNotes.length > 0) {
          setDbNotes(prev => [...insertedNotes, ...prev]);
        }
      }

      return true;
    } catch (err) {
      console.error("Failed to update field:", err);
      triggerErrorToast(`Database write failed: ${err.message}`);
      return false;
    }
  };

  // 4. JSON export action
  const handleExportJson = () => {
    const dataStr = JSON.stringify({
      tasks: dbTasks,
      deliverables: dbDeliverables,
      clientAssets: dbClientAssets,
      launchItems: dbLaunchItems,
      scopeItems: dbScopeItems,
      retainerItems: dbRetainerItems,
      retainerTiers: dbRetainerTiers,
      futurePhaseItems: dbFuturePhaseItems,
      notes: dbNotes,
      updateAuthors: dbAuthors
    }, null, 2);
    const dataUri = "data:application/json;charset=utf-8," + encodeURIComponent(dataStr);
    
    const linkElement = document.createElement("a");
    linkElement.setAttribute("href", dataUri);
    linkElement.setAttribute("download", "command_center_backup.json");
    linkElement.click();
  };

  // 5. Metrics memo
  const metrics = useMemo(() => {
    const phaseOne = dbTasks.filter((task) => task.phase === "Phase 1");
    const donePhaseOne = phaseOne.filter((task) => task.status === "Done").length;
    return {
      total: dbTasks.length,
      done: dbTasks.filter((task) => task.status === "Done").length,
      inProgress: dbTasks.filter((task) => task.status === "In Progress").length,
      waiting: dbTasks.filter((task) => task.status === "Waiting on Client").length,
      blocked: dbTasks.filter((task) => task.status === "Blocked").length,
      high: dbTasks.filter((task) => task.priority === "High").length,
      dueSoon: dbTasks.filter((task) => task.dueDate && task.status !== "Done").length,
      phaseProgress: phaseOne.length ? Math.round((donePhaseOne / phaseOne.length) * 100) : 0,
    };
  }, [dbTasks]);

  const ActiveIcon = navItems.find((item) => item.id === activeView)?.icon ?? LayoutDashboard;

  return (
    <div className="min-h-screen bg-mist">
      {/* Toast Error Alert */}
      {errorNotification && (
        <div className="fixed top-20 right-4 z-50 rounded-md border border-red-200 bg-red-50 p-4 text-xs font-bold text-red-700 shadow-premium max-w-sm lg:top-4 animate-pulse">
          <p>{errorNotification}</p>
        </div>
      )}

      <div className="fixed inset-x-0 top-0 z-40 border-b border-white/10 bg-navy text-white lg:hidden">
        <div className="flex h-16 items-center justify-between px-4">
          <button
            className="rounded-md border border-white/15 p-2"
            onClick={() => setMobileOpen((open) => !open)}
            aria-label="Toggle navigation"
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div className="flex items-center gap-2 text-sm font-black">
            <ActiveIcon size={18} className="text-gold" />
            {navItems.find((item) => item.id === activeView)?.label}
          </div>
        </div>
      </div>

      <aside
        className={cx(
          "fixed inset-y-0 left-0 z-30 w-72 transform bg-navy text-white transition-transform duration-200 lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-full flex-col">
          <div className="border-b border-white/10 p-5">
            <div className="overflow-hidden rounded-lg border border-white/10 bg-white/5">
              <img src={inspiration} alt="Filament (Pty) Ltd and Chasm Bridge Charity visual inspiration" className="h-24 w-full object-cover" />
            </div>
            <p className="mt-4 text-xs font-bold uppercase tracking-[0.18em] text-gold">Embark Digitals</p>
            <h1 className="mt-1 text-xl font-black leading-tight">Chasm Bridge Charity & Filament (Pty) Ltd Command Center</h1>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              Phase 1 builds the foundation. The retainer keeps it running. Future phases turn it into a scalable system.
            </p>
          </div>

          <nav className="flex-1 space-y-1 overflow-y-auto p-3">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = activeView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveView(item.id);
                    setMobileOpen(false);
                  }}
                  aria-current={active ? "page" : undefined}
                  className={cx(
                    "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm font-bold transition",
                    active ? "bg-gold text-navy" : "text-slate-200 hover:bg-white/10 hover:text-white",
                  )}
                >
                  <Icon size={18} />
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className="border-t border-white/10 p-4 text-xs leading-5 text-slate-300 space-y-3">
            <div>
              <p className="font-bold text-white">Phase 1 Fee: R23,000</p>
              <p>Owner: Ndumiso Yedwa, Embark Digitals</p>
            </div>
            {!supabase ? (
              <p className="text-gold font-bold bg-gold/10 border border-gold/25 rounded p-2 text-[10px] uppercase tracking-wider leading-4">
                Supabase is not configured. Editing is disabled.
              </p>
            ) : (
              <div className="pt-2 border-t border-white/10 space-y-1.5">
                <label className="block text-[10px] font-black uppercase tracking-wider text-gold">Active Editor *</label>
                <select
                  value={selectedAuthorId}
                  onChange={(e) => setSelectedAuthorId(e.target.value)}
                  className="w-full h-9 rounded border border-white/15 bg-white/5 px-2 text-xs text-white outline-none ring-gold/30 focus:border-gold focus:ring-2"
                >
                  <option value="" className="bg-navy text-slate-400">Select active editor...</option>
                  {dbAuthors.filter(a => a.is_active).map((a) => (
                    <option key={a.id} value={a.id} className="bg-navy text-white">
                      {a.display_name}
                    </option>
                  ))}
                </select>
                {userRole === "admin" && (
                  <button
                    onClick={handleExportJson}
                    className="w-full mt-2 text-center rounded border border-gold/40 text-gold py-1.5 text-xs font-bold hover:bg-gold hover:text-navy transition"
                  >
                    Export Backup JSON
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </aside>

      {mobileOpen && <button aria-label="Close navigation" className="fixed inset-0 z-20 bg-navy/40 lg:hidden" onClick={() => setMobileOpen(false)} />}

      <main className="pt-20 lg:ml-72 lg:pt-0">
        <div className="mx-auto max-w-7xl px-4 py-6 md:px-8 lg:py-8">
          {/* Active Editor banner warning if not selected */}
          {supabase && !selectedAuthorId && (
            <div className="mb-4 rounded bg-gold/10 border border-gold/30 p-3 text-xs font-bold text-[#795000]">
              ⚠️ Please select an <strong>Active Editor</strong> in the sidebar to enable editing.
            </div>
          )}

          {activeView === "dashboard" && (
            <Dashboard
              metrics={metrics}
              tasks={dbTasks}
              launchChecklist={dbLaunchItems}
              userRole={userRole}
              onUpdateLaunchItem={handleInlineUpdate}
            />
          )}
          {activeView === "tasks" && (
            <TaskCommandCenter
              tasks={dbTasks}
              notes={dbNotes}
              userRole={userRole}
              onUpdateTask={handleInlineUpdate}
              selectedAuthorId={selectedAuthorId}
              authors={dbAuthors}
              onSelectAuthor={setSelectedAuthorId}
            />
          )}
          {activeView === "scope" && (
            <PhaseScope
              phaseDeliverables={dbDeliverables}
              notes={dbNotes}
              userRole={userRole}
              onUpdateDeliverable={handleInlineUpdate}
              selectedAuthorId={selectedAuthorId}
              authors={dbAuthors}
              onSelectAuthor={setSelectedAuthorId}
            />
          )}
          {activeView === "later" && (
            <LaterPhases
              retainerItems={dbRetainerItems}
              futurePhaseItems={dbFuturePhaseItems}
              retainerTiers={dbRetainerTiers}
            />
          )}
          {activeView === "assets" && (
            <ClientAssets
              clientAssets={dbClientAssets}
              notes={dbNotes}
              userRole={userRole}
              onUpdateAsset={handleInlineUpdate}
              selectedAuthorId={selectedAuthorId}
              authors={dbAuthors}
              onSelectAuthor={setSelectedAuthorId}
            />
          )}
          {activeView === "launch" && (
            <LaunchReadiness
              launchChecklist={dbLaunchItems}
              userRole={userRole}
              onUpdateLaunchItem={handleInlineUpdate}
            />
          )}
          {activeView === "boundaries" && (
            <ScopeBoundaries
              scopeItems={dbScopeItems}
            />
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
