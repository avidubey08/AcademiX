// public/js/auth.js

document.addEventListener("DOMContentLoaded", () => {
    const loginForm = document.getElementById("login-form");
    
    // Check if form exists on the page
    if (loginForm) {
        loginForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            
            const emailInput = document.getElementById("email");
            const passwordInput = document.getElementById("password");
            const errorDiv = document.getElementById("error-message");
            const button = loginForm.querySelector("button[type='submit']");
            
            
            errorDiv.style.display = "none";
            errorDiv.textContent = "";

            const payload = {
                role: document.getElementById("role")?.value,
                email: emailInput.value.trim(),
                password: passwordInput.value
            };
            
            try {
                // Optional: show visual feedback
                button.textContent = "Signing In...";
                button.disabled = true;

                // Send login request to our API
                const resp = await fetch("/api/auth/login", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify(payload)
                });
                
                const data = await resp.json();
                
                if (!resp.ok) {
                    throw new Error(data.error || "Login failed");
                }
                
                // On success: save JWT token & user object to localStorage
                localStorage.setItem("token", data.token);
                localStorage.setItem("user", JSON.stringify(data.user));
                
                // Redirect user to their respective dashboard using the role from the API.
                const role = data.user.role;
                if (payload.role && payload.role !== role) {
                    throw new Error(`This account is ${role}. Please choose ${role} in the role selector.`);
                }
                if (role === 'admin') {
                    window.location.href = "/views/admin.html";
                } else if (role === 'professor') {
                    window.location.href = "/views/professor.html";
                } else if (role === 'student') {
                    window.location.href = "/views/student.html";
                } else {
                    throw new Error("Unknown role classification");
                }
                
            } catch (error) {
                // Re-enable UI 
                button.textContent = "Sign In";
                button.disabled = false;
                
                // Show error message
                errorDiv.textContent = error.message;
                errorDiv.style.display = "block";
            }
        });
    }
});

/**
 * Global logout function. Usable from anywhere in the frontend.
 * Can be called using onclick="logout()" in HTML files.
 */
function logout() {
    // Clear storage
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    
    // Redirect to login page
    window.location.href = "/views/login.html";
}
