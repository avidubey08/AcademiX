document.addEventListener("DOMContentLoaded", () => {
  // 1. Verify Authentication & Role
  const token = localStorage.getItem("token");
  const userStr = localStorage.getItem("user");

  if (!token || !userStr) {
    window.location.href = "/views/login.html";
    return;
  }

  const user = JSON.parse(userStr);
  if (user.role !== "admin") {
    alert("Unauthorized access. Admins only.");
    window.location.href = "/views/login.html";
    return;
  }

  // Set the admin's name in the header
  const adminNameSpan = document.getElementById("admin-name");
  if (adminNameSpan) {
    adminNameSpan.textContent = `- Welcome, ${user.name}`;
  }

  // 2. Form Handlers
  const addProfForm = document.getElementById("add-prof-form");
  const addStudentForm = document.getElementById("add-student-form");

  // Helper to show messages
  const showMessage = (elementId, message, isError) => {
    const el = document.getElementById(elementId);
    el.textContent = message;
    el.style.display = "block";
    el.className = `message ${isError ? "error" : "success"}`;
    // Don't auto-hide scan instructions so the user can read them
    if (elementId !== "scan-status") {
      setTimeout(() => {
        el.style.display = "none";
      }, 5000);
    }
  };

  // Add Professor
  if (addProfForm) {
    addProfForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      
      const btn = addProfForm.querySelector('button[type="submit"]');
      btn.disabled = true;
      btn.textContent = "Adding...";

      const rawSubjects = document.getElementById("prof-subjects").value;
      const subjectsArray = rawSubjects.split(",").map(s => s.trim()).filter(s => s);

      const payload = {
        name: document.getElementById("prof-name").value,
        email: document.getElementById("prof-email").value,
        department: document.getElementById("prof-dept").value,
        password: document.getElementById("prof-pass").value,
        subjects: subjectsArray
      };

      try {
        const response = await fetch("/api/admin/professor", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to add professor");
        }

        showMessage("prof-msg", data.message || "Professor created successfully.", false);
        addProfForm.reset();
      } catch (err) {
        showMessage("prof-msg", err.message, true);
      } finally {
        btn.disabled = false;
        btn.textContent = "Add Professor";
      }
    });
  }

  // --- face-api.js Logic (UPGRADED TO 3-ANGLE CAPTURE) ---
  window.faceDescriptorArr = [];
  let capturedDescriptors = []; // Array to hold the 3 face scans
  let captureCount = 0; // Tracks which scan we are on
  const instructions = [
    "📸 Angle 1: Look STRAIGHT at the camera",
    "📸 Angle 2: Turn head SLIGHTLY LEFT",
    "📸 Angle 3: Turn head SLIGHTLY RIGHT"
  ];

  const startWebcamBtn = document.getElementById("start-webcam");
  const scanFaceBtn = document.getElementById("scan-face");
  const videoEl = document.getElementById("webcam");
  const videoContainer = document.getElementById("video-container");

  // Load face-api models from exposed Express route
  const initFaceModels = async () => {
    try {
      await faceapi.nets.ssdMobilenetv1.loadFromUri('/models');
      await faceapi.nets.faceLandmark68TinyNet.loadFromUri('/models');
      await faceapi.nets.faceRecognitionNet.loadFromUri('/models');
      console.log("Face models loaded successfully from /models");
    } catch (e) {
      console.error("Failed to load face models:", e);
      showMessage("scan-status", "Failed to load face models. Check console.", true);
    }
  };
  
  if (typeof faceapi !== "undefined") {
    initFaceModels();
  }

  if (startWebcamBtn) {
    startWebcamBtn.addEventListener("click", async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        videoEl.srcObject = stream;
        videoContainer.style.display = "block";
        scanFaceBtn.disabled = false;
        startWebcamBtn.style.display = "none";
        
        // Reset capture state
        capturedDescriptors = [];
        captureCount = 0;
        scanFaceBtn.textContent = "Scan Angle 1";
        showMessage("scan-status", instructions[0], false);

      } catch (err) {
        console.error("Camera error:", err);
        showMessage("scan-status", "Failed to access webcam.", true);
      }
    });
  }

  if (scanFaceBtn) {
    scanFaceBtn.addEventListener("click", async () => {
      if (captureCount >= 3) return; // Stop if we already have 3

      scanFaceBtn.textContent = "Scanning...";
      scanFaceBtn.disabled = true;

      const detection = await faceapi.detectSingleFace(videoEl, new faceapi.SsdMobilenetv1Options())
        .withFaceLandmarks(true)
        .withFaceDescriptor();

      if (!detection) {
        showMessage("scan-status", `No face detected. ${instructions[captureCount]} and try again.`, true);
        scanFaceBtn.textContent = `Retry Angle ${captureCount + 1}`;
        scanFaceBtn.disabled = false;
        return;
      }

      // Save this angle's 128-D array
      capturedDescriptors.push(detection.descriptor);
      captureCount++;

      if (captureCount < 3) {
        // Prepare UI for the next angle
        showMessage("scan-status", instructions[captureCount], false);
        scanFaceBtn.textContent = `Scan Angle ${captureCount + 1}/3`;
        scanFaceBtn.disabled = false;
      } else {
        // ALL 3 ANGLES CAPTURED - Calculate Average
        showMessage("scan-status", "Processing high-accuracy vector...", false);
        
        const averagedDescriptor = new Float32Array(128);
        for (let i = 0; i < 128; i++) {
          averagedDescriptor[i] = (
            capturedDescriptors[0][i] + 
            capturedDescriptors[1][i] + 
            capturedDescriptors[2][i]
          ) / 3.0;
        }

        // Convert Float32Array to standard JS Array for backend storage
        window.faceDescriptorArr = Array.from(averagedDescriptor);
        showMessage("scan-status", "✅ 3 Angles Captured & Averaged! Face Data Ready.", false);

        // Stop webcam stream
        const stream = videoEl.srcObject;
        if (stream) {
          stream.getTracks().forEach(track => track.stop());
        }
        videoContainer.style.display = "none";
        scanFaceBtn.textContent = "All Scanned ✓";
      }
    });
  }

  // Add Student Submission
  if (addStudentForm) {
    addStudentForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      if (!Array.isArray(window.faceDescriptorArr) || window.faceDescriptorArr.length !== 128) {
        showMessage("student-msg", "Please complete all 3 face scans before creating the account.", true);
        return;
      }

      const btn = addStudentForm.querySelector('button[type="submit"]');
      btn.disabled = true;
      btn.textContent = "Adding...";

      const payload = {
        name: document.getElementById("student-name").value,
        email: document.getElementById("student-email").value,
        department: document.getElementById("student-dept").value,
        rollNo: document.getElementById("student-roll").value,
        password: document.getElementById("student-pass").value,
        faceDescriptor: window.faceDescriptorArr // the averaged 128-d array
      };

      try {
        const response = await fetch("/api/admin/student", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to add student");
        }

        showMessage("student-msg", data.message || "Student created successfully.", false);
        
        // Reset everything for the next student
        addStudentForm.reset();
        window.faceDescriptorArr = [];
        capturedDescriptors = [];
        captureCount = 0;
        
        const scanBtn = document.getElementById("scan-face");
        if (scanBtn) {
          scanBtn.textContent = "Scan Face";
          scanBtn.disabled = true;
        }
        const webcamBtn = document.getElementById("start-webcam");
        if (webcamBtn) webcamBtn.style.display = "inline-block";
        document.getElementById("scan-status").style.display = "none";

        // Refresh the user table below
        loadUsers();

      } catch (err) {
        showMessage("student-msg", err.message, true);
      } finally {
        btn.disabled = false;
        btn.textContent = "Add Student";
      }
    });
  }

  // Initial call to load users when page loads
  loadUsers();
});

// ==========================================
// MANAGE USERS LOGIC (READ, UPDATE, DELETE)
// ==========================================

async function loadUsers() {
  const token = localStorage.getItem("token");
  const tbody = document.getElementById("users-table-body");
  
  try {
    const response = await fetch("/api/admin/users", {
      headers: { "Authorization": `Bearer ${token}` }
    });
    if (!response.ok) throw new Error("Failed to fetch users");
    
    const users = await response.json();
    tbody.innerHTML = ""; 
    
    if (users.length === 0) {
      tbody.innerHTML = "<tr><td colspan='5' style='text-align: center;'>No users found.</td></tr>";
      return;
    }

    users.forEach(user => {
      const tr = document.createElement("tr");
      const roleColor = user.role === "professor" ? "#f39c12" : "#3498db";
      const roleBadge = `<span style="background: ${roleColor}; padding: 4px 10px; border-radius: 12px; font-size: 0.85em; font-weight: bold; color: white;">${user.role.toUpperCase()}</span>`;

      // Safely encode the user data to pass to the modal
      const userJson = encodeURIComponent(JSON.stringify(user));

      tr.innerHTML = `
        <td><strong>${user.name}</strong></td>
        <td>${user.email}</td>
        <td>${roleBadge}</td>
        <td>${user.department || "N/A"}</td>
        <td>
          <button class="action-btn btn-edit" onclick="openEditModal('${userJson}')">Edit</button>
          <button class="action-btn btn-delete" onclick="deleteUser('${user._id}')">Delete</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (error) {
    console.error(error);
  }
}

window.deleteUser = async function(userId) {
  if (!confirm("Are you sure you want to delete this user? This action cannot be undone and will erase their attendance records.")) {
    return; 
  }

  const token = localStorage.getItem("token");
  try {
    const response = await fetch(`/api/admin/users/${userId}`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${token}` }
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || "Failed to delete user");
    }

    alert("User deleted successfully.");
    loadUsers(); 
  } catch (error) {
    alert(error.message);
  }
};

window.openEditModal = function(userJson) {
  const user = JSON.parse(decodeURIComponent(userJson));
  
  document.getElementById("edit-user-id").value = user._id;
  document.getElementById("edit-name").value = user.name;
  document.getElementById("edit-email").value = user.email;
  document.getElementById("edit-dept").value = user.department || "";

  const subjGroup = document.getElementById("edit-subjects-group");
  const rollGroup = document.getElementById("edit-roll-group");

  if (user.role === "professor") {
    subjGroup.style.display = "block";
    rollGroup.style.display = "none";
    document.getElementById("edit-subjects").value = user.professorProfile?.subjects?.join(", ") || "";
  } else if (user.role === "student") {
    subjGroup.style.display = "none";
    rollGroup.style.display = "block";
    document.getElementById("edit-roll").value = user.rollNo || "";
  }

  document.getElementById("edit-modal").style.display = "flex";
};

window.closeEditModal = function() {
  document.getElementById("edit-modal").style.display = "none";
};

document.getElementById("edit-user-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  
  const id = document.getElementById("edit-user-id").value;
  const name = document.getElementById("edit-name").value.trim();
  const email = document.getElementById("edit-email").value.trim();
  const department = document.getElementById("edit-dept").value.trim();
  const subjects = document.getElementById("edit-subjects").value.trim();
  const rollNo = document.getElementById("edit-roll").value.trim();
  
  const token = localStorage.getItem("token");

  try {
    const response = await fetch(`/api/admin/users/${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ name, email, department, subjects, rollNo })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Failed to update user");

    alert("User updated successfully!");
    closeEditModal();
    loadUsers(); 
  } catch (error) {
    alert(error.message);
  }
});
