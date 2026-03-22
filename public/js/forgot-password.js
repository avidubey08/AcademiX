document.addEventListener("DOMContentLoaded", () => {
    const requestForm = document.getElementById("request-form");
    const resetForm = document.getElementById("reset-form");
    const statusMsg = document.getElementById("status-message");
    const emailInput = document.getElementById("email");
    
    let savedEmail = "";

    const showMessage = (msg, isError) => {
        statusMsg.textContent = msg;
        statusMsg.style.display = "block";
        statusMsg.className = `message ${isError ? "error" : "success"}`;
    };

    // Step 1: Send Request
    requestForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const btn = requestForm.querySelector("button");
        btn.disabled = true;
        btn.textContent = "Sending...";
        statusMsg.style.display = "none";

        savedEmail = emailInput.value.trim();

        try {
            const resp = await fetch("/api/auth/forgot-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: savedEmail })
            });

            const data = await resp.json();

            if (!resp.ok) {
                throw new Error(data.error || "Failed to request OTP");
            }

            showMessage(data.message, false);
            
            // Swap UI to Step 2
            requestForm.style.display = "none";
            resetForm.style.display = "block";
            
        } catch (error) {
            showMessage(error.message, true);
        } finally {
            btn.disabled = false;
            btn.textContent = "Send Reset OTP";
        }
    });

    // Step 2: Submit Reset
    resetForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const btn = resetForm.querySelector("button");
        btn.disabled = true;
        btn.textContent = "Resetting...";
        statusMsg.style.display = "none";

        const otp = document.getElementById("otp").value.trim();
        const newPassword = document.getElementById("new-password").value;

        try {
            const resp = await fetch("/api/auth/reset-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                    email: savedEmail,
                    otp,
                    newPassword
                })
            });

            const data = await resp.json();

            if (!resp.ok) {
                throw new Error(data.error || "Failed to reset password");
            }

            showMessage("Password successfully reset! Redirecting to login...", false);
            resetForm.style.display = "none";
            
            setTimeout(() => {
                window.location.href = "/views/login.html";
            }, 3000);

        } catch (error) {
            showMessage(error.message, true);
            btn.disabled = false;
            btn.textContent = "Complete Reset";
        }
    });
});