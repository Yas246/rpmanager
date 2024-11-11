"use client";

import {
  DatePicker,
  LocalizationProvider,
  TimePicker,
} from "@mui/x-date-pickers";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import dayjs, { Dayjs } from "dayjs";
import jsPDF from "jspdf";
import { useEffect, useState } from "react";
interface Task {
  startTime: Dayjs | null;
  endTime: Dayjs | null;
  description: string;
  problems?: string;
}

interface Report {
  date: Dayjs;
  firstName: string;
  lastName: string;
  arrivalTime: Dayjs | null;
  departureTime: Dayjs | null;
  tasks: Task[];
  plannedTasks: string;
}

// Add a new interface for serialized data
interface SerializedTask {
  startTime: string | null;
  endTime: string | null;
  description: string;
  problems?: string;
}

interface SerializedReport {
  id?: number;
  date: string;
  firstName: string;
  lastName: string;
  arrivalTime: string | null;
  departureTime: string | null;
  tasks: SerializedTask[];
  plannedTasks: string;
}

const DB_NAME = "WorkReportsDB";
const STORE_NAME = "reports";

const initDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, {
          keyPath: "id",
          autoIncrement: true,
        });
      }
    };
  });
};

const serializeReport = (report: Report): SerializedReport => {
  return {
    ...report,
    date: report.date.toISOString(),
    arrivalTime: report.arrivalTime?.toISOString() || null,
    departureTime: report.departureTime?.toISOString() || null,
    tasks: report.tasks.map((task) => ({
      ...task,
      startTime: task.startTime?.toISOString() || null,
      endTime: task.endTime?.toISOString() || null,
    })),
  };
};

const deserializeReport = (report: SerializedReport): Report => {
  return {
    ...report,
    date: dayjs(report.date),
    arrivalTime: report.arrivalTime ? dayjs(report.arrivalTime) : null,
    departureTime: report.departureTime ? dayjs(report.departureTime) : null,
    tasks: report.tasks.map((task: SerializedTask) => ({
      ...task,
      startTime: task.startTime ? dayjs(task.startTime) : null,
      endTime: task.endTime ? dayjs(task.endTime) : null,
    })),
  };
};

export default function Home() {
  const [report, setReport] = useState<Report>({
    date: dayjs(),
    firstName: "",
    lastName: "",
    arrivalTime: null,
    departureTime: null,
    tasks: [{ startTime: null, endTime: null, description: "", problems: "" }],
    plannedTasks: "",
  });

  const [error, setError] = useState<string | null>(null);
  const [pastReports, setPastReports] = useState<Report[]>([]);
  const [searchDate, setSearchDate] = useState<Dayjs | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== "undefined") {
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    return false;
  });

  const [deferredPrompt, setDeferredPrompt] = useState<boolean>(false);
  const [isInstallable, setIsInstallable] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      const registerServiceWorker = async () => {
        try {
          const registration = await navigator.serviceWorker.register(
            "/service-worker.js"
          );
          console.log("ServiceWorker registration successful:", registration);

          registration.addEventListener("updatefound", () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener("statechange", () => {
                if (
                  newWorker.state === "installed" &&
                  navigator.serviceWorker.controller
                ) {
                  const updateApp = window.confirm(
                    "New version available! Would you like to update?"
                  );
                  if (updateApp) {
                    newWorker.postMessage({ type: "SKIP_WAITING" });
                    window.location.reload();
                  }
                }
              });
            }
          });
        } catch (err) {
          console.error("ServiceWorker registration failed:", err);
        }
      };

      // Attendre que la page soit complètement chargée
      if (document.readyState === "complete") {
        registerServiceWorker();
      } else {
        window.addEventListener("load", registerServiceWorker);
      }

      return () => {
        window.removeEventListener("load", registerServiceWorker);
      };
    }
  }, []);

  useEffect(() => {
    const loadReports = async () => {
      try {
        const db = await initDB();
        const transaction = (db as IDBDatabase).transaction(
          STORE_NAME,
          "readonly"
        );
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => {
          const reports = request.result.map(deserializeReport);
          setPastReports(reports);
        };
      } catch (error) {
        console.error("Error loading reports:", error);
      }
    };

    loadReports();
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (e: MediaQueryListEvent) => setIsDarkMode(e.matches);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    window.addEventListener("beforeinstallprompt", (e) => {
      // Prevent Chrome 67 and earlier from automatically showing the prompt
      e.preventDefault();
      // Stash the event so it can be triggered later.
      setDeferredPrompt(e);
      setIsInstallable(true);
    });

    window.addEventListener("appinstalled", () => {
      // Clear the deferredPrompt so it can be garbage collected
      setDeferredPrompt(null);
      setIsInstallable(false);
      console.log("PWA was installed");
    });

    return () => {
      window.removeEventListener("beforeinstallprompt", () => {});
      window.removeEventListener("appinstalled", () => {});
    };
  }, []);

  const addTask = () => {
    setReport((prev) => ({
      ...prev,
      tasks: [
        ...prev.tasks,
        { startTime: null, endTime: null, description: "", problems: "" },
      ],
    }));
  };

  const removeTask = (index: number) => {
    setReport((prev) => ({
      ...prev,
      tasks: prev.tasks.filter((_, i) => i !== index),
    }));
  };

  const updateTask = (
    index: number,
    field: keyof Task,
    value: string | Dayjs | null
  ) => {
    setReport((prev) => ({
      ...prev,
      tasks: prev.tasks.map((task, i) =>
        i === index ? { ...task, [field]: value } : task
      ),
    }));
  };

  const validateReport = (): boolean => {
    if (!report.firstName || !report.lastName) {
      setError("Veuillez remplir votre nom et prénom");
      return false;
    }

    if (!report.arrivalTime || !report.departureTime) {
      setError("Veuillez remplir les heures d'arrivée et de départ");
      return false;
    }

    if (
      report.tasks.some(
        (task) => !task.startTime || !task.endTime || !task.description
      )
    ) {
      setError("Veuillez remplir toutes les informations de la tâche");
      return false;
    }

    setError(null);
    return true;
  };

  const generatePDF = async () => {
    if (!validateReport()) return;

    // Créer le PDF en mode paysage
    const doc = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a4",
    });

    // Initialiser la position de départ
    let yPos = 20;

    // Ajouter les informations d'en-tête
    doc.setFontSize(16);
    doc.text("Rapport de travail journalier", 20, yPos);
    yPos += 10;

    doc.setFontSize(12);
    doc.text(`Nom: ${report.lastName} ${report.firstName}`, 20, yPos);
    yPos += 7;
    doc.text(`Date: ${report.date.format("DD/MM/YYYY")}`, 20, yPos);
    yPos += 15;

    // Définir la structure du tableau
    const tableStartY = yPos;
    const pageWidth = doc.internal.pageSize.getWidth();
    const leftMargin = 20; // Marge à gauche
    const rightMargin = 20; // Marge à droite
    const usableWidth = pageWidth - leftMargin - rightMargin; // Largeur utilisable sans les marges

    // Définir les largeurs des colonnes (en pourcentage de la largeur totale)
    const col1Width = usableWidth * 0.15; // Première colonne 15%
    const col2Width = usableWidth * 0.15; // Deuxième colonne 20%
    const col3Width = usableWidth * 0.4; // Troisième colonne 32.5%
    const col4Width = usableWidth * 0.3; // Quatrième colonne 32.5%

    // Dessiner les en-têtes du tableau
    doc.setFillColor(240, 240, 240);
    doc.rect(leftMargin, yPos, pageWidth - leftMargin - rightMargin, 10, "F");
    doc.setFont(undefined, "bold");

    doc.text("Heure d'arrivée", leftMargin + 5, yPos + 7); // Première colonne
    doc.text("Heure de départ", leftMargin + col1Width + 5, yPos + 7); // Deuxième colonne
    doc.text(
      "Tâches effectuées",
      leftMargin + col1Width + col2Width + 5,
      yPos + 7
    ); // Troisième colonne
    doc.text(
      "Travaux prévus",
      leftMargin + col1Width + col2Width + col3Width + 5,
      yPos + 7
    ); // Quatrième colonne

    // Réinitialiser la police
    doc.setFont(undefined, "normal");
    yPos += 10;

    // Calculer la hauteur du contenu
    const tasksText = report.tasks
      .map(
        (task) =>
          `${task.startTime?.format("HH:mm")} - ${task.endTime?.format(
            "HH:mm"
          )}: ${task.description}` +
          (task.problems ? `\nProblèmes: ${task.problems}` : "")
      )
      .join("\n\n");

    // Séparer le texte pour qu'il tienne dans les colonnes
    const splitTasks = doc.splitTextToSize(tasksText, col3Width - 10);
    const splitPlannedTasks = doc.splitTextToSize(
      report.plannedTasks,
      col4Width - 10
    );

    // Calculer la hauteur maximale nécessaire pour le contenu
    const contentHeight = Math.max(
      doc.getTextDimensions(splitTasks).h,
      doc.getTextDimensions(splitPlannedTasks).h
    );

    // Dessiner les cellules du tableau
    doc.rect(
      leftMargin,
      tableStartY,
      pageWidth - leftMargin - rightMargin,
      contentHeight + 20
    );
    doc.line(
      leftMargin + col1Width,
      tableStartY,
      leftMargin + col1Width,
      tableStartY + contentHeight + 20
    );
    doc.line(
      leftMargin + col1Width + col2Width,
      tableStartY,
      leftMargin + col1Width + col2Width,
      tableStartY + contentHeight + 20
    );
    doc.line(
      leftMargin + col1Width + col2Width + col3Width,
      tableStartY,
      leftMargin + col1Width + col2Width + col3Width,
      tableStartY + contentHeight + 20
    );

    // Ajouter le contenu dans les cellules du tableau
    doc.text(
      report.arrivalTime?.format("HH:mm") || "",
      leftMargin + 5,
      yPos + 7
    ); // Heure d'arrivée
    doc.text(
      report.departureTime?.format("HH:mm") || "",
      leftMargin + col1Width + 5,
      yPos + 7
    ); // Heure de départ
    doc.text(splitTasks, leftMargin + col1Width + col2Width + 5, yPos + 7); // Tâches effectuées
    doc.text(
      splitPlannedTasks,
      leftMargin + col1Width + col2Width + col3Width + 5,
      yPos + 7
    ); // Travaux prévus

    try {
      const db = await initDB();
      const transaction = (db as IDBDatabase).transaction(
        STORE_NAME,
        "readwrite"
      );
      const store = transaction.objectStore(STORE_NAME);
      const reportToSave = { ...report, id: Date.now() };
      const serializedReport = serializeReport(reportToSave);
      await store.add(serializedReport);
      setPastReports((prev) => [...prev, deserializeReport(serializedReport)]);
    } catch (error) {
      console.error("Error saving report:", error);
      setError("Failed to save report offline");
    }

    doc.save(`report-${report.date.format("YYYY-MM-DD")}.pdf`);
  };

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    // Show the install prompt
    deferredPrompt.prompt();

    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User response to the install prompt: ${outcome}`);

    // We've used the prompt, and can't use it again, discard it
    setDeferredPrompt(null);
    setIsInstallable(false);
  };

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <div
        className={`min-h-screen ${
          isDarkMode ? "dark bg-gray-900" : "bg-gray-50"
        }`}
      >
        <div className="container mx-auto max-w-2xl px-4 py-8">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold text-black dark:text-white">
              Rapport de travail journalier
            </h1>
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="p-2 rounded-lg bg-gray-50 dark:bg-gray-700 dark:text-white"
            >
              {isDarkMode ? "☀️" : "🌙"}
            </button>
            {isInstallable && (
              <button
                onClick={handleInstallClick}
                className="ml-4 p-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800"
              >
                Installer l&apos;application
              </button>
            )}
          </div>

          {error && (
            <div className="bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-100 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-6">
            <div className="grid grid-cols-2 gap-4 mb-6">
              <input
                type="text"
                placeholder="Prénom"
                value={report.firstName}
                onChange={(e) =>
                  setReport((prev) => ({ ...prev, firstName: e.target.value }))
                }
                className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              />
              <input
                type="text"
                placeholder="Nom"
                value={report.lastName}
                onChange={(e) =>
                  setReport((prev) => ({ ...prev, lastName: e.target.value }))
                }
                className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              />
            </div>

            <div className="mb-6">
              <DatePicker
                label="Date du rapport"
                value={report.date}
                onChange={(newValue) =>
                  setReport((prev) => ({ ...prev, date: newValue || dayjs() }))
                }
                className="w-full"
              />
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <TimePicker
                label="Heure d'arrivée"
                value={report.arrivalTime}
                onChange={(newValue) =>
                  setReport((prev) => ({ ...prev, arrivalTime: newValue }))
                }
                ampm={false}
                format="HH:mm"
              />
              <TimePicker
                label="Heure de départ"
                value={report.departureTime}
                onChange={(newValue) =>
                  setReport((prev) => ({ ...prev, departureTime: newValue }))
                }
                ampm={false}
                format="HH:mm"
              />
            </div>

            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
              Tâches effectuées
            </h2>

            <div className="space-y-6">
              {report.tasks.map((task, index) => (
                <div key={index} className="p-4 border rounded-lg">
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <TimePicker
                      label="Heure de début"
                      value={task.startTime}
                      onChange={(newValue) =>
                        updateTask(index, "startTime", newValue)
                      }
                      ampm={false}
                      format="HH:mm"
                    />
                    <TimePicker
                      label="Heure de fin"
                      value={task.endTime}
                      onChange={(newValue) =>
                        updateTask(index, "endTime", newValue)
                      }
                      ampm={false}
                      format="HH:mm"
                    />
                  </div>
                  <input
                    type="text"
                    placeholder="Description de la tâche"
                    value={task.description}
                    onChange={(e) =>
                      updateTask(index, "description", e.target.value)
                    }
                    className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:placeholder-gray-400"
                  />
                  <input
                    type="text"
                    placeholder="Problèmes (optionnel)"
                    value={task.problems}
                    onChange={(e) =>
                      updateTask(index, "problems", e.target.value)
                    }
                    className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:placeholder-gray-400"
                  />
                  <button
                    onClick={() => removeTask(index)}
                    className="mt-2 text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                  >
                    Supprimer la tâche
                  </button>
                </div>
              ))}
            </div>

            <button
              onClick={addTask}
              className="mt-4 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
            >
              + Ajouter une tâche
            </button>

            <div className="mt-6 p-4 border rounded-lg">
              <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
                Travaux prévus pour le jour ouvrable suivant
              </h2>
              <textarea
                placeholder="Décrivez les travaux prévus pour le jour suivant"
                value={report.plannedTasks}
                onChange={(e) =>
                  setReport((prev) => ({
                    ...prev,
                    plannedTasks: e.target.value,
                  }))
                }
                className="w-full p-2 border rounded min-h-[100px] dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:placeholder-gray-400"
              />
            </div>

            <button
              onClick={generatePDF}
              className="w-full mt-6 bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800"
            >
              Générer le PDF
            </button>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold mb-4 dark:text-white">
              Rapports passés
            </h2>
            <div className="mb-6">
              <DatePicker
                label="Rechercher par date"
                value={searchDate}
                onChange={setSearchDate}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              {pastReports
                .filter((r) => !searchDate || r.date.isSame(searchDate, "day"))
                .map((r, index) => (
                  <button
                    key={index}
                    onClick={() => setReport(r)}
                    className="w-full text-left p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded dark:text-white"
                  >
                    {r.date.format("YYYY-MM-DD")}
                  </button>
                ))}
            </div>
          </div>
        </div>
      </div>
      <style jsx global>{`
        .MuiInputBase-input {
          color: ${isDarkMode ? "#fff" : "#000"} !important;
        }
        .MuiInputLabel-root {
          color: ${isDarkMode ? "#9ca3af" : "#6b7280"} !important;
        }
        .MuiOutlinedInput-notchedOutline {
          border-color: ${isDarkMode ? "#4b5563" : "#e5e7eb"} !important;
        }
        .MuiIconButton-root {
          color: ${isDarkMode ? "#9ca3af" : "#6b7280"} !important;
        }
      `}</style>
    </LocalizationProvider>
  );
}
