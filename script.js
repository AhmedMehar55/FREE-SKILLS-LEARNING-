/* ==========================================
   UK ACCOUNT GIVEAWAY
   Main JavaScript
========================================== */

/*
   IMPORTANT:
   Add your Supabase Project URL and publishable
   key below before using registration and voting.
*/

const SUPABASE_URL = "YOUR_SUPABASE_PROJECT_URL";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_PUBLISHABLE_KEY";

const PAGE_SIZE = 30;

let supabaseClient = null;
let allMembers = [];
let filteredMembers = [];
let currentPage = 1;


// ==========================================
// INITIALIZE WEBSITE
// ==========================================

document.addEventListener("DOMContentLoaded", () => {
    updateCurrentYear();
    setupMobileMenu();
    setupSearch();
    setupPagination();
    setupRegistration();

    if (isSupabaseConfigured()) {
        initializeSupabase();
        loadMembers();

        // Refresh shared data every 15 seconds.
        window.setInterval(loadMembers, 15000);
    } else {
        showMessage(
            "votingMessage",
            "Database setup is required before registration and voting can work.",
            "error"
        );

        renderEmptyState(
            "Connect your Supabase database to display members."
        );
    }
});


// ==========================================
// SUPABASE CONFIGURATION
// ==========================================

function isSupabaseConfigured() {
    return (
        SUPABASE_URL.startsWith("https://") &&
        SUPABASE_URL.includes(".supabase.co") &&
        SUPABASE_ANON_KEY.length > 20 &&
        !SUPABASE_ANON_KEY.includes("YOUR_SUPABASE")
    );
}

function initializeSupabase() {
    if (
        !window.supabase ||
        typeof window.supabase.createClient !== "function"
    ) {
        showMessage(
            "votingMessage",
            "Could not load the database library. Please refresh the page.",
            "error"
        );
        return;
    }

    supabaseClient = window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_ANON_KEY
    );
}


// ==========================================
// MOBILE NAVIGATION
// ==========================================

function setupMobileMenu() {
    const menuButton = document.getElementById("menuToggle");
    const navigation = document.getElementById("navigation");

    if (!menuButton || !navigation) return;

    menuButton.addEventListener("click", () => {
        const isOpen = navigation.classList.toggle("open");

        menuButton.setAttribute(
            "aria-expanded",
            String(isOpen)
        );
    });

    navigation.querySelectorAll("a").forEach(link => {
        link.addEventListener("click", () => {
            navigation.classList.remove("open");
            menuButton.setAttribute("aria-expanded", "false");
        });
    });
}


// ==========================================
// CURRENT YEAR
// ==========================================

function updateCurrentYear() {
    const yearElement = document.getElementById("currentYear");

    if (yearElement) {
        yearElement.textContent = new Date().getFullYear();
    }
}


// ==========================================
// REGISTRATION
// ==========================================

function setupRegistration() {
    const form = document.getElementById("registrationForm");

    if (!form) return;

    form.addEventListener("submit", async event => {
        event.preventDefault();

        if (!supabaseClient) {
            showMessage(
                "registrationMessage",
                "Please configure Supabase before registering.",
                "error"
            );
            return;
        }

        const name = document
            .getElementById("memberName")
            .value.trim();

        const phone = document
            .getElementById("memberPhone")
            .value.trim();

        const city = document
            .getElementById("memberCity")
            .value.trim();

        const button = document.getElementById("registerButton");

        if (!name || !phone || !city) {
            showMessage(
                "registrationMessage",
                "Please complete all fields.",
                "error"
            );
            return;
        }

        if (
            name.length > 80 ||
            phone.length > 25 ||
            city.length > 80
        ) {
            showMessage(
                "registrationMessage",
                "Please check the length of your information.",
                "error"
            );
            return;
        }

        button.disabled = true;
        button.textContent = "Registering...";

        showMessage(
            "registrationMessage",
            "Please wait while your registration is processed.",
            "info"
        );

        try {
            const { data, error } = await supabaseClient.rpc(
                "register_member",
                {
                    p_name: name,
                    p_phone: phone,
                    p_city: city
                }
            );

            if (error) throw error;

            const member = Array.isArray(data) ? data[0] : data;

            if (!member || !member.id) {
                throw new Error(
                    "Registration response was incomplete."
                );
            }

            try {
                localStorage.setItem(
                    "ukgiveaway_my_member",
                    JSON.stringify({
                        id: member.id,
                        member_no: member.member_no,
                        name: member.name || name
                    })
                );
            } catch (storageError) {
                console.warn(
                    "Local storage is unavailable.",
                    storageError
                );
            }

            showMessage(
                "registrationMessage",
                "Registration completed successfully!",
                "success"
            );

            form.reset();

            await loadMembers();

            document.getElementById("voting").scrollIntoView({
                behavior: "smooth"
            });

        } catch (error) {
            console.error("Registration error:", error);

            showMessage(
                "registrationMessage",
                "Registration failed. Please check the database setup and try again.",
                "error"
            );
        } finally {
            button.disabled = false;
            button.textContent = "Complete Registration";
        }
    });
}


// ==========================================
// LOAD MEMBERS FROM SUPABASE
// ==========================================

async function loadMembers() {
    if (!supabaseClient) return;

    try {
        const { data, error } = await supabaseClient
            .from("members")
            .select("id, member_no, name, city, vote_count")
            .order("member_no", { ascending: true });

        if (error) throw error;

        allMembers = data || [];

        applySearchFilters();
        updateStatistics();

    } catch (error) {
        console.error("Member loading error:", error);

        showMessage(
            "votingMessage",
            "Unable to load members. Please check your database settings.",
            "error"
        );

        renderEmptyState("Members could not be loaded.");
    }
}


// ==========================================
// SEARCH
// ==========================================

function setupSearch() {
    const numberInput = document.getElementById("searchNumber");
    const nameInput = document.getElementById("searchName");
    const cityInput = document.getElementById("searchCity");
    const clearButton = document.getElementById("clearSearch");

    [numberInput, nameInput, cityInput].forEach(input => {
        if (!input) return;

        input.addEventListener("input", () => {
            currentPage = 1;
            applySearchFilters();
        });
    });

    if (clearButton) {
        clearButton.addEventListener("click", () => {
            if (numberInput) numberInput.value = "";
            if (nameInput) nameInput.value = "";
            if (cityInput) cityInput.value = "";

            currentPage = 1;
            applySearchFilters();
        });
    }
}

function applySearchFilters() {
    const numberValue = (
        document.getElementById("searchNumber")?.value || ""
    ).trim();

    const nameValue = (
        document.getElementById("searchName")?.value || ""
    ).trim().toLowerCase();

    const cityValue = (
        document.getElementById("searchCity")?.value || ""
    ).trim().toLowerCase();

    filteredMembers = allMembers.filter(member => {
        const matchesNumber =
            !numberValue ||
            String(member.member_no) === numberValue;

        const matchesName =
            !nameValue ||
            String(member.name || "")
                .toLowerCase()
                .includes(nameValue);

        const matchesCity =
            !cityValue ||
            String(member.city || "")
                .toLowerCase()
                .includes(cityValue);

        return matchesNumber && matchesName && matchesCity;
    });

    const totalPages = Math.max(
        1,
        Math.ceil(filteredMembers.length / PAGE_SIZE)
    );

    currentPage = Math.min(currentPage, totalPages);

    renderMembers();
    updatePagination();
}


// ==========================================
// RENDER MEMBERS
// ==========================================

function renderMembers() {
    const tableBody = document.getElementById("membersList");

    if (!tableBody) return;

    tableBody.replaceChildren();

    if (filteredMembers.length === 0) {
        renderEmptyState("No members found.");
        return;
    }

    const startIndex = (currentPage - 1) * PAGE_SIZE;
    const pageMembers = filteredMembers.slice(
        startIndex,
        startIndex + PAGE_SIZE
    );

    pageMembers.forEach(member => {
        const row = document.createElement("tr");

        addCell(row, "#" + member.member_no);
        addCell(row, member.name);
        addCell(row, member.city);
        addCell(row, Number(member.vote_count || 0).toLocaleString());

        const actionCell = document.createElement("td");
        const voteButton = document.createElement("button");

        voteButton.type = "button";
        voteButton.className = "btn btn-primary";
        voteButton.textContent = "Vote";

        voteButton.addEventListener("click", () => {
            castVote(member.id, voteButton);
        });

        actionCell.appendChild(voteButton);
        row.appendChild(actionCell);
        tableBody.appendChild(row);
    });
}

function addCell(row, value) {
    const cell = document.createElement("td");

    // textContent prevents member information from being interpreted as HTML.
    cell.textContent = value == null ? "" : String(value);

    row.appendChild(cell);
}

function renderEmptyState(message) {
    const tableBody = document.getElementById("membersList");

    if (!tableBody) return;

    tableBody.replaceChildren();

    const row = document.createElement("tr");
    const cell = document.createElement("td");

    cell.colSpan = 5;
    cell.className = "empty-state";
    cell.textContent = message;

    row.appendChild(cell);
    tableBody.appendChild(row);
}


// ==========================================
// VOTING
// ==========================================

function getVoterId() {
    let voterId = null;

    try {
        voterId = localStorage.getItem("ukgiveaway_voter_id");

        if (!voterId) {
            if (
                !window.crypto ||
                typeof window.crypto.randomUUID !== "function"
            ) {
                throw new Error("Secure UUID generation is unavailable.");
            }

            voterId = window.crypto.randomUUID();

            localStorage.setItem(
                "ukgiveaway_voter_id",
                voterId
            );
        }
    } catch (error) {
        console.error("Voter identity error:", error);
        return null;
    }

    return voterId;
}

async function castVote(memberId, button) {
    if (!supabaseClient) {
        showMessage(
            "votingMessage",
            "Please configure the database first.",
            "error"
        );
        return;
    }

    const voterId = getVoterId();

    if (!voterId) {
        showMessage(
            "votingMessage",
            "Unable to establish a voter session in this browser.",
            "error"
        );
        return;
    }

    const confirmed = window.confirm(
        "Do you want to vote for this member?"
    );

    if (!confirmed) return;

    button.disabled = true;
    button.textContent = "Voting...";

    try {
        const { error } = await supabaseClient.rpc(
            "cast_vote",
            {
                p_member_id: memberId,
                p_voter_id: voterId
            }
        );

        if (error) {
            const errorText = String(error.message || "").toLowerCase();

            if (
                errorText.includes("duplicate") ||
                errorText.includes("unique") ||
                errorText.includes("already")
            ) {
                showMessage(
                    "votingMessage",
                    "You have already voted for this member using this browser session.",
                    "error"
                );
                return;
            }

            throw error;
        }

        showMessage(
            "votingMessage",
            "Your vote was submitted successfully.",
            "success"
        );

        await loadMembers();

    } catch (error) {
        console.error("Voting error:", error);

        showMessage(
            "votingMessage",
            "Your vote could not be submitted. Please try again.",
            "error"
        );
    } finally {
        button.disabled = false;
        button.textContent = "Vote";
    }
}


// ==========================================
// STATISTICS
// ==========================================

function updateStatistics() {
    const totalMembers = document.getElementById("totalMembers");
    const totalVotes = document.getElementById("totalVotes");
    const topVotes = document.getElementById("topVotes");

    const votes = allMembers.map(member =>
        Number(member.vote_count || 0)
    );

    const total = votes.reduce(
        (sum, count) => sum + count,
        0
    );

    const highest = votes.length ? Math.max(...votes) : 0;

    if (totalMembers) {
        totalMembers.textContent = allMembers.length.toLocaleString();
    }

    if (totalVotes) {
        totalVotes.textContent = total.toLocaleString();
    }

    if (topVotes) {
        topVotes.textContent = highest.toLocaleString();
    }
}


// ==========================================
// PAGINATION
// ==========================================

function setupPagination() {
    const previousButton = document.getElementById("previousPage");
    const nextButton = document.getElementById("nextPage");

    if (previousButton) {
        previousButton.addEventListener("click", () => {
            if (currentPage > 1) {
                currentPage--;
                renderMembers();
                updatePagination();
            }
        });
    }

    if (nextButton) {
        nextButton.addEventListener("click", () => {
            const totalPages = Math.max(
                1,
                Math.ceil(filteredMembers.length / PAGE_SIZE)
            );

            if (currentPage < totalPages) {
                currentPage++;
                renderMembers();
                updatePagination();
            }
        });
    }
}

function updatePagination() {
    const previousButton = document.getElementById("previousPage");
    const nextButton = document.getElementById("nextPage");
    const pageInfo = document.getElementById("pageInfo");

    const totalPages = Math.max(
        1,
        Math.ceil(filteredMembers.length / PAGE_SIZE)
    );

    if (previousButton) {
        previousButton.disabled = currentPage <= 1;
    }

    if (nextButton) {
        nextButton.disabled = currentPage >= totalPages;
    }

    if (pageInfo) {
        pageInfo.textContent =
            `Page ${currentPage} of ${totalPages}`;
    }
}


// ==========================================
// STATUS MESSAGES
// ==========================================

function showMessage(elementId, message, type = "info") {
    const element = document.getElementById(elementId);

    if (!element) return;

    element.textContent = message;

    if (type === "success") {
        element.style.color = "#15803d";
    } else if (type === "error") {
        element.style.color = "#b91c1c";
    } else {
        element.style.color = "#4b5563";
    }
}
