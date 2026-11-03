// ==============================================================================
// MSCP AMY'S HOUSE INVENTORY SYSTEM - BULLETPROOF DEFINITIVE CONTROLLER
// ==============================================================================

const SUPABASE_URL = 'https://sfrgoujuwmctssszndrs.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_zm8UZ9x6LlQwr-UdCziZ0g_7DbJvBbq';

document.addEventListener('DOMContentLoaded', async () => {

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').catch(err => console.log('SW Registration:', err));
    }

    if (!window.supabase) {
        alert('Critical error: Supabase CDN failed to load. Check your internet connection.');
        return;
    }

    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // Strict UUID Validation Function to prevent PostgreSQL 22P02 "undefined" errors
    function toValidUUID(val) {
        if (!val || typeof val !== 'string') return null;
        const trimmed = val.trim();
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        return uuidRegex.test(trimmed) ? trimmed : null;
    }

    // Global in-memory cache
    let cachedItems = [];
    let cachedDepts = [];
    let cachedDonors = [];
    let cachedBalances = [];
    let cachedMovements = [];
    let cachedDonations = [];
    let cachedAssets = [];
    let cachedStaff = [];
    let cachedAlerts = [];
    let cachedRequests = [];

    let currentUserName = '';
    let currentUserDeptCode = '';
    let currentUserEmail = '';

    // DOM Elements
    const authSection = document.getElementById('auth-section');
    const dashSection = document.getElementById('dashboard-section');
    const appNavTabs = document.getElementById('app-nav-tabs');
    const logoutBtn = document.getElementById('logout-btn');
    const myProfileBtn = document.getElementById('btn-edit-my-profile');
    const loginForm = document.getElementById('login-form');
    const errorBox = document.getElementById('login-error-box');

    // --------------------------------------------------------------------------
    // 1. AUTHENTICATION & ACCESS CONTROL
    // --------------------------------------------------------------------------
    const { data: { session } } = await supabase.auth.getSession();
    const savedStaffName = sessionStorage.getItem('staff_name');
    const savedDeptCode = sessionStorage.getItem('dept_code');
    const savedEmail = sessionStorage.getItem('staff_email');

    if (session && savedStaffName && savedDeptCode) {
        currentUserName = savedStaffName;
        currentUserDeptCode = savedDeptCode;
        currentUserEmail = savedEmail || `${savedDeptCode.toLowerCase()}@amyshouse.org`;
        initDashboard();
    }

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorBox.style.display = 'none';

        const deptCode = document.getElementById('auth-dept-code').value.toUpperCase().trim();
        const staffName = document.getElementById('auth-staff-name').value.trim();
        const password = document.getElementById('auth-password').value;

        if (!deptCode || !staffName) {
            errorBox.textContent = 'Please choose a department and enter your staff name.';
            errorBox.style.display = 'block';
            return;
        }

        const email = `${deptCode.toLowerCase()}@amyshouse.org`;
        const submitBtn = document.getElementById('login-submit-btn');
        submitBtn.textContent = 'Verifying...';
        submitBtn.disabled = true;

        try {
            const { error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) throw new Error('Invalid Department PIN or Password: ' + error.message);

            sessionStorage.setItem('staff_name', staffName);
            sessionStorage.setItem('dept_code', deptCode);
            sessionStorage.setItem('staff_email', email);

            currentUserName = staffName;
            currentUserDeptCode = deptCode;
            currentUserEmail = email;

            initDashboard();
        } catch (err) {
            errorBox.textContent = err.message;
            errorBox.style.display = 'block';
            submitBtn.textContent = 'Unlock System';
            submitBtn.disabled = false;
        }
    });

    logoutBtn.addEventListener('click', async () => {
        await supabase.auth.signOut();
        sessionStorage.clear();
        window.location.reload();
    });

    function initDashboard() {
        authSection.style.display = 'none';
        dashSection.style.display = 'block';
        appNavTabs.style.display = 'block';
        logoutBtn.style.display = 'inline-block';
        myProfileBtn.style.display = 'inline-block';

        const isAdmin = currentUserDeptCode === 'AD001';
        const isStorekeeper = currentUserDeptCode === 'ST001';

        const roleTitle = isAdmin 
            ? 'Executive Admin (Oversight & Management)' 
            : isStorekeeper 
            ? 'Central Storekeeper (Main Warehouse)' 
            : `Department Operator [${currentUserDeptCode}]`;

        document.getElementById('user-display-role').textContent = `${currentUserName} · ${roleTitle}`;

        // STRICT ACCESS PRIVILEGES
        if (isAdmin) {
            document.getElementById('nav-btn-accounts').style.display = 'flex';
            document.getElementById('nav-btn-donations').style.display = 'flex';
            document.getElementById('nav-btn-donors').style.display = 'flex';
            document.getElementById('admin-org-summary-bar').style.display = 'grid';
        } else {
            document.getElementById('nav-btn-accounts').style.display = 'none';
            document.getElementById('nav-btn-donations').style.display = 'none';
            document.getElementById('nav-btn-donors').style.display = 'none';
            document.getElementById('admin-org-summary-bar').style.display = 'none';
        }

        setupTabNavigation();
        wireAllModalButtons();
        loadMasterMetadata();
        setupFilters();
        refreshAllViews();
    }

    // --------------------------------------------------------------------------
    // 2. MODAL & MULTI-ITEM BATCH WIRING
    // --------------------------------------------------------------------------
    function wireAllModalButtons() {
        safeClick('btn-open-new-item-modal', () => showModal('modal-new-item'));
        safeClick('btn-open-new-donor-modal', () => openDonorEditor());
        safeClick('btn-open-add-donor', () => openDonorEditor());
        safeClick('btn-open-asset-modal', () => showModal('modal-new-asset'));
        safeClick('btn-open-new-staff-modal', () => showModal('modal-new-staff'));
        safeClick('btn-open-request-modal', () => showModal('modal-raise-request'));
        safeClick('btn-edit-my-profile', () => {
            document.getElementById('my_profile_name').value = currentUserName;
            document.getElementById('my_profile_dept').value = `${currentUserDeptCode} (${currentUserEmail})`;
            showModal('modal-my-profile');
        });

        safeClick('btn-cancel-donor-modal', () => hideModal('modal-donor-editor'));
        safeClick('btn-cancel-profile-modal', () => hideModal('modal-my-profile'));
        safeClick('btn-cancel-item-modal', () => hideModal('modal-new-item'));
        safeClick('btn-cancel-asset-modal', () => hideModal('modal-new-asset'));
        safeClick('btn-cancel-staff-modal', () => hideModal('modal-new-staff'));
        safeClick('btn-cancel-edit-staff-modal', () => hideModal('modal-edit-staff'));

        // Toggle Single vs Multi-Item Batch Issuance
        safeClick('btn-toggle-multi-item', () => {
            const singleForm = document.getElementById('movement-form');
            const batchSection = document.getElementById('multi-item-batch-section');
            const btn = document.getElementById('btn-toggle-multi-item');

            const isBatch = !batchSection.classList.contains('hidden');
            if (isBatch) {
                batchSection.classList.add('hidden');
                singleForm.classList.remove('hidden');
                btn.textContent = '📦 Switch to Multi-Item Batch';
            } else {
                singleForm.classList.add('hidden');
                batchSection.classList.remove('hidden');
                btn.textContent = '✏️ Switch to Single Movement';
                if (!document.getElementById('batch-items-table-body').children.length) {
                    addBatchRow();
                    addBatchRow();
                }
            }
        });

        safeClick('btn-add-batch-row', addBatchRow);
        safeClick('btn-submit-batch-distribution', submitBatchDistribution);

        safeClick('btn-add-req-row', () => {
            const container = document.getElementById('req-items-container');
            const row = document.createElement('div');
            row.className = 'grid grid-cols-3 gap-2 req-item-row';
            row.innerHTML = `
                <div class="col-span-2">
                    <input list="items-datalist" placeholder="Select Item..." class="w-full p-1.5 border rounded text-xs req-item-input">
                </div>
                <div>
                    <input type="number" step="0.1" min="0.1" placeholder="Quantity" class="w-full p-1.5 border rounded text-xs req-item-qty">
                </div>
            `;
            container.appendChild(row);
        });

        safeClick('btn-toggle-action-centre', () => {
            const drawer = document.getElementById('action-centre-drawer');
            const isHidden = drawer.classList.contains('hidden');
            drawer.classList.toggle('hidden', !isHidden);
            document.getElementById('btn-toggle-action-centre').innerHTML = isHidden 
                ? '<span>▲ Collapse</span>' 
                : '<span>▼ Review Items</span>';
        });
    }

    function safeClick(id, fn) {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', fn);
    }

    function showModal(id) {
        const el = document.getElementById(id);
        if (el) el.classList.remove('hidden');
    }

    function hideModal(id) {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    }

    // --------------------------------------------------------------------------
    // 3. ACTION CENTRE ALERTS (REQUISITIONS, LOW STOCK & EXPIRY)
    // --------------------------------------------------------------------------
    async function loadActionCentre() {
        const panel = document.getElementById('action-centre-panel');
        const pillsContainer = document.getElementById('action-centre-summary-pills');

        let query = supabase.from('action_centre_alerts').select('*');
        if (currentUserDeptCode !== 'AD001' && currentUserDeptCode !== 'ST001') {
            query = query.eq('dept_code', currentUserDeptCode);
        }

        const { data: alerts, error } = await query;
        if (error || !alerts || !alerts.length) {
            panel.style.display = 'none';
            return;
        }

        cachedAlerts = alerts;
        panel.style.display = 'block';

        const reqCount = alerts.filter(a => a.alert_type === 'REQUEST_PENDING').length;
        const expiredCount = alerts.filter(a => a.alert_type === 'EXPIRED').length;
        const soonCount = alerts.filter(a => a.alert_type === 'EXPIRING_SOON').length;
        const lowCount = alerts.filter(a => a.alert_type === 'LOW_STOCK').length;

        pillsContainer.innerHTML = `
            ${reqCount > 0 ? `<span class="bg-blue-600 text-white font-bold px-2 py-0.5 rounded-full">🔔 ${reqCount} Requisition${reqCount > 1 ? 's' : ''}</span>` : ''}
            ${expiredCount > 0 ? `<span class="bg-red-600 text-white font-bold px-2 py-0.5 rounded-full">🔴 ${expiredCount} Expired</span>` : ''}
            ${soonCount > 0 ? `<span class="bg-amber-100 text-amber-900 border border-amber-300 font-semibold px-2 py-0.5 rounded-full">🟡 ${soonCount} Expiring Soon</span>` : ''}
            ${lowCount > 0 ? `<span class="bg-orange-100 text-orange-900 border border-orange-300 font-semibold px-2 py-0.5 rounded-full">🟠 ${lowCount} Low Stock</span>` : ''}
        `;

        renderActionCentreDrawer('ALL');
    }

    window.filterActionCentre = (type) => {
        document.querySelectorAll('.ac-filter-btn').forEach(btn => btn.classList.remove('bg-gray-200', 'font-semibold'));
        renderActionCentreDrawer(type);
    };

    function renderActionCentreDrawer(filterType) {
        const container = document.getElementById('action-centre-items');
        const list = filterType === 'ALL' ? cachedAlerts : cachedAlerts.filter(a => a.alert_type === filterType);

        if (!list.length) {
            container.innerHTML = '<div class="py-4 text-center text-gray-400">No alerts in this category.</div>';
            return;
        }

        container.innerHTML = list.map(a => {
            const isReq = a.alert_type === 'REQUEST_PENDING';
            const isExpired = a.alert_type === 'EXPIRED';
            const isLow = a.alert_type === 'LOW_STOCK';

            return `
                <div class="py-2.5 flex flex-col md:flex-row md:items-center justify-between gap-2">
                    <div class="flex items-center gap-2">
                        <span class="px-2 py-0.5 rounded text-[10px] font-bold ${
                            isReq ? 'bg-blue-600 text-white' :
                            isExpired ? 'bg-red-600 text-white' : 
                            isLow ? 'bg-orange-100 text-orange-900' : 
                            'bg-amber-100 text-amber-900'
                        }">
                            ${a.alert_type}
                        </span>
                        <span class="font-bold text-gray-900">${a.item_name}</span>
                        <span class="text-gray-500">(${a.department_name})</span>
                        <span class="text-xs text-gray-600">${a.alert_message}</span>
                    </div>
                    <div>
                        ${isReq ? 
                            `<button onclick="window.viewRequisitionsTab()" class="text-xs font-semibold px-2.5 py-1 rounded bg-blue-700 hover:bg-blue-800 text-white">Review Request</button>` :
                            `<button onclick="window.handleActionCentreAlert('${a.item_id}', '${a.item_name}', '${isExpired ? 'Spoilage or Loss' : isLow ? 'Purchase' : 'Weekly Supply'}')" class="text-xs font-semibold px-2.5 py-1 rounded transition ${isExpired ? 'bg-red-700 hover:bg-red-800 text-white' : 'bg-[#0b3b2c] hover:bg-[#07281c] text-white'}">
                                ${isExpired ? 'Write off Spoilage' : isLow ? 'Order More' : 'Prioritize (FIFO)'}
                            </button>`
                        }
                    </div>
                </div>
            `;
        }).join('');
    }

    window.viewRequisitionsTab = () => {
        document.querySelector('[data-tab="tab-requests"]').click();
    };

    window.handleActionCentreAlert = (itemId, itemName, recommendedMovement) => {
        document.querySelector('[data-tab="tab-move"]').click();
        document.getElementById('movement_type').value = recommendedMovement;
        document.getElementById('movement_type').dispatchEvent(new Event('change'));

        const item = cachedItems.find(i => i.id === itemId);
        if (item) {
            document.getElementById('item_search_input').value = `${item.name} (${item.unit})`;
            document.getElementById('item_id').value = item.id;
        }
        document.getElementById('reason').value = `Action Centre: Action for ${itemName}`;
    };

    // --------------------------------------------------------------------------
    // 4. TAB NAVIGATION
    // --------------------------------------------------------------------------
    function setupTabNavigation() {
        const tabs = document.querySelectorAll('.tab-btn');
        tabs.forEach(btn => {
            btn.addEventListener('click', () => {
                tabs.forEach(t => t.classList.remove('bg-emerald-900', 'text-white'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));

                btn.classList.add('bg-emerald-900', 'text-white');
                const targetId = btn.getAttribute('data-tab');
                document.getElementById(targetId).classList.remove('hidden');

                if (targetId === 'tab-stock') loadStockBalances();
                if (targetId === 'tab-move') checkAndGenerateDonationRef();
                if (targetId === 'tab-requests') loadRequisitions();
                if (targetId === 'tab-ledger') loadLedgerRecords();
                if (targetId === 'tab-donations') loadDonationRegister();
                if (targetId === 'tab-donors') loadDonorsDirectory();
                if (targetId === 'tab-assets') loadAssets();
                if (targetId === 'tab-replenishment') loadReplenishmentList();
                if (targetId === 'tab-accounts') loadStaffAccounts();
            });
        });
    }

    // --------------------------------------------------------------------------
    // 5. MASTER DATA & SEARCHABLE DROPDOWNS
    // --------------------------------------------------------------------------
    async function loadMasterMetadata() {
        try {
            const [{ data: items }, { data: depts }, { data: donors }] = await Promise.all([
                supabase.from('items').select('*').order('name'),
                supabase.from('departments').select('*').order('name'),
                supabase.from('donors').select('*').order('name')
            ]);

            cachedItems = items || [];
            cachedDepts = depts || [];
            cachedDonors = donors || [];

            populateDropdowns();
            populateSearchableComboboxes();
        } catch (err) {
            console.error('Metadata load error:', err);
        }
    }

    function populateDropdowns() {
        const deptSelect = document.getElementById('department_id');
        const transferDestSelect = document.getElementById('transfer_dest_dept_id');
        const batchDestSelect = document.getElementById('batch_dest_dept_id');
        const assetDeptSelect = document.getElementById('asset_dept_id');
        const newStaffDeptSelect = document.getElementById('new_staff_dept');
        const editStaffDeptSelect = document.getElementById('edit_staff_dept');
        const filterStockDept = document.getElementById('filter-stock-dept');
        const filterLedgerDept = document.getElementById('filter-ledger-dept');
        const filterAssetsDept = document.getElementById('filter-assets-dept');

        const storeDept = cachedDepts.find(d => d.dept_code === 'ST001');
        const storeDeptId = storeDept ? storeDept.id : '';

        const recipientDeptOptions = '<option value="">Select Destination Department...</option>' + 
            cachedDepts.filter(d => d.dept_code !== 'ST001').map(d => `<option value="${d.id}">${d.name} (${d.dept_code})</option>`).join('');

        transferDestSelect.innerHTML = recipientDeptOptions;
        if (batchDestSelect) batchDestSelect.innerHTML = recipientDeptOptions;

        if (currentUserDeptCode === 'AD001' || currentUserDeptCode === 'ST001') {
            deptSelect.innerHTML = `<option value="${storeDeptId}">Central Store (Main Warehouse)</option>` + 
                cachedDepts.filter(d => d.dept_code !== 'ST001').map(d => `<option value="${d.id}">${d.name} (${d.dept_code})</option>`).join('');
            deptSelect.disabled = false;

            assetDeptSelect.innerHTML = cachedDepts.map(d => `<option value="${d.id}">${d.name} (${d.dept_code})</option>`).join('');
            assetDeptSelect.disabled = false;

            const filterOptions = '<option value="ALL">All Departments</option>' + 
                cachedDepts.map(d => `<option value="${d.dept_code}">${d.name}</option>`).join('');

            filterStockDept.innerHTML = filterOptions;
            filterLedgerDept.innerHTML = filterOptions;
            filterAssetsDept.innerHTML = filterOptions;
        } else {
            const myDept = cachedDepts.find(d => d.dept_code === currentUserDeptCode);
            if (myDept) {
                deptSelect.innerHTML = `<option value="${myDept.id}">${myDept.name} (${myDept.dept_code})</option>`;
                deptSelect.disabled = true;

                assetDeptSelect.innerHTML = `<option value="${myDept.id}">${myDept.name} (${myDept.dept_code})</option>`;
                assetDeptSelect.disabled = true;

                filterStockDept.innerHTML = `<option value="${myDept.dept_code}">${myDept.name}</option>`;
                filterStockDept.disabled = true;

                filterLedgerDept.innerHTML = `<option value="${myDept.dept_code}">${myDept.name}</option>`;
                filterLedgerDept.disabled = true;

                filterAssetsDept.innerHTML = `<option value="${myDept.dept_code}">${myDept.name}</option>`;
                filterAssetsDept.disabled = true;
            }
        }

        if (newStaffDeptSelect) newStaffDeptSelect.innerHTML = cachedDepts.map(d => `<option value="${d.dept_code}">${d.name} (${d.dept_code})</option>`).join('');
        if (editStaffDeptSelect) editStaffDeptSelect.innerHTML = cachedDepts.map(d => `<option value="${d.dept_code}">${d.name} (${d.dept_code})</option>`).join('');
    }

    function populateSearchableComboboxes() {
        const itemsDatalist = document.getElementById('items-datalist');
        itemsDatalist.innerHTML = cachedItems.map(i => `<option data-id="${i.id}" value="${i.name} (${i.unit})"></option>`).join('');

        const donorsDatalist = document.getElementById('donors-datalist');
        donorsDatalist.innerHTML = cachedDonors.map(dn => `<option data-id="${dn.id}" value="[${dn.donor_code || 'DNR'}] ${dn.name}"></option>`).join('');
    }

    document.getElementById('item_search_input').addEventListener('input', (e) => {
        const val = e.target.value.trim();
        const matched = cachedItems.find(i => `${i.name} (${i.unit})`.toLowerCase() === val.toLowerCase() || i.name.toLowerCase() === val.toLowerCase());
        const hint = document.getElementById('item-current-price-hint');
        const priceInput = document.getElementById('unit_price');

        if (matched) {
            document.getElementById('item_id').value = matched.id;
            const price = matched.last_purchase_price || matched.standard_cost || 0;
            hint.textContent = `Standard: KES ${price}`;
            if (!priceInput.value) priceInput.value = price;
        } else {
            document.getElementById('item_id').value = '';
            hint.textContent = '';
        }
    });

    document.getElementById('donor_search_input').addEventListener('input', (e) => {
        const val = e.target.value.trim().toLowerCase();
        const matched = cachedDonors.find(dn => 
            `[${dn.donor_code || 'DNR'}] ${dn.name}`.toLowerCase() === val || 
            dn.name.toLowerCase() === val ||
            (dn.donor_code && dn.donor_code.toLowerCase() === val)
        );
        const infoDiv = document.getElementById('donor-quick-info');

        if (matched) {
            document.getElementById('donor_id').value = matched.id;
            infoDiv.textContent = `Code: ${matched.donor_code} | Phone: ${matched.phone_number || 'N/A'}`;
        } else {
            document.getElementById('donor_id').value = '';
            infoDiv.textContent = '';
        }
    });

    // --------------------------------------------------------------------------
    // 6. AUTO DONATION REF GENERATION
    // --------------------------------------------------------------------------
    async function checkAndGenerateDonationRef() {
        const moveType = document.getElementById('movement_type').value;
        if (!moveType.startsWith('Donation')) return;

        let prefix = 'AH';
        const deptId = toValidUUID(document.getElementById('department_id').value);
        const dept = cachedDepts.find(d => d.id === deptId);

        if (dept) {
            if (dept.dept_code === 'FC001') prefix = 'FC';
            else if (dept.dept_code === 'ES001') prefix = 'ES';
            else if (dept.dept_code === 'EE001') prefix = 'EE';
            else if (dept.dept_code === 'FN001') prefix = 'FN';
        }

        const { data: refNum, error } = await supabase.rpc('get_next_donation_ref', { dept_prefix: prefix });
        if (!error && refNum) {
            document.getElementById('donation_ref').value = refNum;
        }
    }

    document.getElementById('department_id').addEventListener('change', checkAndGenerateDonationRef);

    document.getElementById('movement_type').addEventListener('change', async (e) => {
        const val = e.target.value;
        const donationFields = document.getElementById('donation-fields');
        const transferFields = document.getElementById('transfer-destination-fields');
        const directionSelect = document.getElementById('direction');

        donationFields.style.display = val.startsWith('Donation') ? 'block' : 'none';
        transferFields.style.display = val === 'Transfer to Department' ? 'block' : 'none';

        if (val.startsWith('Donation')) {
            directionSelect.value = 'In';
            await checkAndGenerateDonationRef();
        } else if (['Purchase', 'Farm Produce'].includes(val)) {
            directionSelect.value = 'In';
        } else {
            directionSelect.value = 'Out';
        }
    });

    // --------------------------------------------------------------------------
    // 7. RECORD SINGLE STOCK MOVEMENT
    // --------------------------------------------------------------------------
    document.getElementById('movement-form').addEventListener('submit', async (e) => {
        e.preventDefault();

        const moveType = document.getElementById('movement_type').value;
        const isDonation = moveType.startsWith('Donation');
        const isTransfer = moveType === 'Transfer to Department';

        const itemId = toValidUUID(document.getElementById('item_id').value);
        const deptId = toValidUUID(document.getElementById('department_id').value);
        const donorId = toValidUUID(document.getElementById('donor_id').value);
        const destDeptId = toValidUUID(document.getElementById('transfer_dest_dept_id').value);

        if (!itemId) {
            alert('Please type and select a valid item from the catalogue list.');
            document.getElementById('item_search_input').focus();
            return;
        }

        if (!deptId) {
            alert('Please select a valid source department.');
            document.getElementById('department_id').focus();
            return;
        }

        if (isTransfer && !destDeptId) {
            alert('Please select the Destination Department for this transfer.');
            return;
        }

        const direction = document.getElementById('direction').value;
        const quantity = parseFloat(document.getElementById('quantity').value);
        const unitPrice = parseFloat(document.getElementById('unit_price').value) || 0;
        const totalCost = unitPrice * quantity;
        const reasonText = document.getElementById('reason').value.trim();
        const recipientName = document.getElementById('recipient_name').value.trim();

        if (direction === 'Out') {
            const { data: balanceCheck } = await supabase
                .from('current_stock_balances')
                .select('balance')
                .eq('item_id', itemId)
                .eq('department_id', deptId)
                .maybeSingle();

            const currentAvailable = balanceCheck ? balanceCheck.balance : 0;
            if (quantity > currentAvailable) {
                if (!confirm(`Warning: Only ${currentAvailable} in stock for this department. Record anyway as an authorized adjustment?`)) {
                    return;
                }
            }
        }

        const saveBtn = document.getElementById('btn-save-movement');
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving Movement...';

        try {
            const payload = {
                item_id: itemId,
                department_id: deptId,
                movement_type: moveType,
                direction: direction,
                quantity: quantity,
                unit_price: unitPrice,
                total_cost: totalCost,
                reason_category: document.getElementById('reason_category').value || null,
                people_count: parseInt(document.getElementById('people_count').value) || null,
                reason: reasonText || (isTransfer ? `Issue to ${cachedDepts.find(d => d.id === destDeptId)?.name}` : null),
                notes: reasonText || null,
                recipient_name: recipientName || null,
                transfer_to_dept_id: isTransfer ? destDeptId : null,
                expiry_date: document.getElementById('expiry_date').value || null,
                performed_by_name: currentUserName,
                performed_by_email: currentUserEmail,
                performed_by_dept: currentUserDeptCode,
                donor_id: isDonation ? donorId : null,
                donation_ref: isDonation ? document.getElementById('donation_ref').value || null : null,
                donor_intent: isDonation ? (moveType.includes('Amy') ? 'Unrestricted' : 'Department Specific') : null,
                item_condition: isDonation ? document.getElementById('item_condition').value || 'Good' : null
            };

            const { error } = await supabase.from('stock_movements').insert([payload]);
            if (error) throw error;

            if (isTransfer) {
                const destinationPayload = {
                    item_id: itemId,
                    department_id: destDeptId,
                    movement_type: 'Transfer to Department',
                    direction: 'In',
                    quantity: quantity,
                    unit_price: unitPrice,
                    total_cost: totalCost,
                    reason: `Received from ${cachedDepts.find(d => d.id === deptId)?.name} (Collected by ${recipientName || 'Staff'})`,
                    performed_by_name: currentUserName,
                    performed_by_email: currentUserEmail,
                    performed_by_dept: currentUserDeptCode
                };
                await supabase.from('stock_movements').insert([destinationPayload]);
            }

            alert(isTransfer ? 'Transfer completed! Stock issued to department.' : 'Movement saved successfully!');
            document.getElementById('movement-form').reset();
            document.getElementById('item_id').value = '';
            document.getElementById('donor_id').value = '';
            document.getElementById('donation-fields').style.display = 'none';
            document.getElementById('transfer-destination-fields').style.display = 'none';

            await loadMasterMetadata();
            refreshAllViews();
        } catch (err) {
            alert('Error saving movement: ' + err.message);
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Confirm & Save Movement';
        }
    });

    // --------------------------------------------------------------------------
    // 8. MULTI-ITEM BATCH DISTRIBUTION
    // --------------------------------------------------------------------------
    function addBatchRow() {
        const tbody = document.getElementById('batch-items-table-body');
        const tr = document.createElement('tr');
        tr.className = 'batch-row border-b';
        tr.innerHTML = `
            <td class="p-2">
                <input list="items-datalist" placeholder="Type or select commodity..." class="w-full p-1.5 border rounded text-xs batch-item-input">
            </td>
            <td class="p-2 font-mono text-gray-500 batch-item-avail">—</td>
            <td class="p-2">
                <input type="number" step="0.1" min="0.1" placeholder="Qty" class="w-24 p-1.5 border rounded text-xs font-bold text-[#0b3b2c] batch-item-qty">
            </td>
            <td class="p-2 text-right">
                <button type="button" onclick="this.closest('tr').remove(); window.updateBatchCount();" class="text-red-600 font-bold hover:text-red-800 text-sm">✕</button>
            </td>
        `;
        tbody.appendChild(tr);

        const input = tr.querySelector('.batch-item-input');
        input.addEventListener('input', (e) => {
            const val = e.target.value.trim().toLowerCase();
            const matched = cachedItems.find(i => `${i.name} (${i.unit})`.toLowerCase() === val || i.name.toLowerCase() === val);
            const availCell = tr.querySelector('.batch-item-avail');
            if (matched) {
                tr.dataset.itemId = matched.id;
                const balanceRec = cachedBalances.find(b => b.item_id === matched.id && b.dept_code === 'ST001');
                const qty = balanceRec ? balanceRec.balance : 0;
                availCell.textContent = `${qty} ${matched.unit}`;
                if (qty <= 0) availCell.classList.add('text-red-600');
            } else {
                tr.dataset.itemId = '';
                availCell.textContent = '—';
            }
        });

        window.updateBatchCount();
    }

    window.updateBatchCount = () => {
        const count = document.querySelectorAll('.batch-row').length;
        document.getElementById('batch-row-count').textContent = `${count} commodity item${count !== 1 ? 's' : ''} in batch`;
    };

    async function submitBatchDistribution() {
        const destDeptId = toValidUUID(document.getElementById('batch_dest_dept_id').value);
        const moveType = document.getElementById('batch_movement_type').value;
        const recipient = document.getElementById('batch_recipient_name').value.trim();

        if (!destDeptId) return alert('Please select the receiving department for this batch.');
        if (!recipient) return alert('Please enter the name of the staff member collecting this batch.');

        const rows = document.querySelectorAll('.batch-row');
        if (!rows.length) return alert('Please add at least one item row to the batch.');

        const batchRef = `BATCH-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(100 + Math.random() * 900)}`;
        const movementsToInsert = [];

        const storeDept = cachedDepts.find(d => d.dept_code === 'ST001');
        const storeDeptId = storeDept ? storeDept.id : '';

        for (const row of rows) {
            const itemId = toValidUUID(row.dataset.itemId);
            const qty = parseFloat(row.querySelector('.batch-item-qty').value);

            if (!itemId || isNaN(qty) || qty <= 0) {
                alert('Please ensure all commodity rows have a valid item and quantity selected.');
                return;
            }

            movementsToInsert.push({
                item_id: itemId,
                department_id: storeDeptId,
                movement_type: moveType,
                direction: 'Out',
                quantity: qty,
                recipient_name: recipient,
                transfer_to_dept_id: destDeptId,
                batch_ref: batchRef,
                reason: `Batch distribution (${batchRef}) issued to ${cachedDepts.find(d => d.id === destDeptId)?.name}`,
                performed_by_name: currentUserName,
                performed_by_email: currentUserEmail,
                performed_by_dept: currentUserDeptCode
            });

            movementsToInsert.push({
                item_id: itemId,
                department_id: destDeptId,
                movement_type: moveType,
                direction: 'In',
                quantity: qty,
                recipient_name: recipient,
                batch_ref: batchRef,
                reason: `Batch receipt (${batchRef}) collected by ${recipient}`,
                performed_by_name: currentUserName,
                performed_by_email: currentUserEmail,
                performed_by_dept: currentUserDeptCode
            });
        }

        const submitBtn = document.getElementById('btn-submit-batch-distribution');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Saving Batch Distribution...';

        try {
            const { error } = await supabase.from('stock_movements').insert(movementsToInsert);
            if (error) throw error;

            alert(`Batch ${batchRef} successfully issued to department! All items updated.`);
            document.getElementById('batch-items-table-body').innerHTML = '';
            document.getElementById('batch_recipient_name').value = '';
            window.updateBatchCount();

            document.getElementById('btn-toggle-multi-item').click();
            await loadMasterMetadata();
            refreshAllViews();
        } catch (err) {
            alert('Error saving batch: ' + err.message);
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Confirm & Save All Batch Movements';
        }
    }

    // --------------------------------------------------------------------------
    // 9. REQUISITION & REQUESTS PIPELINE
    // --------------------------------------------------------------------------
    document.getElementById('form-raise-request').addEventListener('submit', async (e) => {
        e.preventDefault();

        let reqDeptId = null;
        if (currentUserDeptCode !== 'AD001' && currentUserDeptCode !== 'ST001') {
            reqDeptId = cachedDepts.find(d => d.dept_code === currentUserDeptCode)?.id;
        } else {
            reqDeptId = cachedDepts.find(d => d.dept_code === 'FC001')?.id;
        }

        if (!reqDeptId) return alert('Department could not be identified.');

        const rows = document.querySelectorAll('.req-item-row');
        const itemsToRequest = [];

        rows.forEach(r => {
            const val = r.querySelector('.req-item-input').value.trim().toLowerCase();
            const matched = cachedItems.find(i => `${i.name} (${i.unit})`.toLowerCase() === val || i.name.toLowerCase() === val);
            const qty = parseFloat(r.querySelector('.req-item-qty').value);
            if (matched && qty > 0) {
                itemsToRequest.push({ item_id: matched.id, quantity_requested: qty });
            }
        });

        if (!itemsToRequest.length) return alert('Please add at least one item and quantity to your requisition.');

        const requestPayload = {
            requesting_dept_id: reqDeptId,
            requested_by_name: currentUserName,
            pickup_date: document.getElementById('req_pickup_date').value,
            urgency: document.getElementById('req_urgency').value,
            purpose: document.getElementById('req_purpose').value.trim() || 'Department requisition',
            status: 'Pending'
        };

        const { data: requestRec, error: reqError } = await supabase.from('stock_requests').insert([requestPayload]).select().single();
        if (reqError) return alert('Error creating requisition: ' + reqError.message);

        const itemPayloads = itemsToRequest.map(item => ({
            request_id: requestRec.id,
            item_id: item.item_id,
            quantity_requested: item.quantity_requested
        }));

        await supabase.from('stock_request_items').insert(itemPayloads);

        alert(`Requisition ${requestRec.request_code} successfully submitted to Central Store!`);
        document.getElementById('form-raise-request').reset();
        hideModal('modal-raise-request');
        loadRequisitions();
        loadActionCentre();
    });

    async function loadRequisitions() {
        const tbody = document.getElementById('requests-table-body');
        let query = supabase.from('stock_requests').select('*, departments(name, dept_code), stock_request_items(*, items(name, unit))').order('created_at', { ascending: false });

        if (currentUserDeptCode !== 'AD001' && currentUserDeptCode !== 'ST001') {
            const myDept = cachedDepts.find(d => d.dept_code === currentUserDeptCode);
            if (myDept) query = query.eq('requesting_dept_id', myDept.id);
        }

        const { data, error } = await query;
        if (error) {
            tbody.innerHTML = `<tr><td colspan="8" class="p-4 text-center text-red-500">Error: ${error.message}</td></tr>`;
            return;
        }

        cachedRequests = data || [];
        if (!cachedRequests.length) {
            tbody.innerHTML = '<tr><td colspan="8" class="p-6 text-center text-gray-400">No requisitions submitted yet.</td></tr>';
            return;
        }

        tbody.innerHTML = cachedRequests.map(r => {
            const isPending = r.status === 'Pending';
            const itemsList = r.stock_request_items.map(it => `• ${it.items?.name || 'Item'}: <strong>${it.quantity_requested} ${it.items?.unit || ''}</strong>`).join('<br>');
            const canManage = currentUserDeptCode === 'AD001' || currentUserDeptCode === 'ST001';

            return `
                <tr class="hover:bg-gray-50 border-b">
                    <td class="p-2.5 font-mono font-bold text-blue-900">${r.request_code}</td>
                    <td class="p-2.5 text-xs text-gray-700 font-semibold">${r.departments?.name}</td>
                    <td class="p-2.5 text-xs">${r.requested_by_name}</td>
                    <td class="p-2.5 text-xs font-mono">${r.pickup_date || 'Flexible'}</td>
                    <td class="p-2.5">
                        <span class="px-2 py-0.5 rounded text-[11px] font-bold ${r.urgency === 'Urgent' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'}">
                            ${r.urgency}
                        </span>
                    </td>
                    <td class="p-2.5 text-xs">${itemsList}</td>
                    <td class="p-2.5">
                        <span class="px-2 py-0.5 rounded text-xs font-semibold ${
                            r.status === 'Fulfilled' ? 'bg-green-100 text-green-800' :
                            r.status === 'Pending' ? 'bg-amber-100 text-amber-800 font-bold animate-pulse' : 'bg-gray-100 text-gray-600'
                        }">
                            ${r.status}
                        </span>
                    </td>
                    <td class="p-2.5 text-right space-x-1">
                        ${canManage && isPending ? `
                            <button onclick="window.fulfillRequisition('${r.id}')" class="text-xs bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-2.5 py-1 rounded">Fulfill</button>
                            <button onclick="window.declineRequisition('${r.id}')" class="text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 px-2 py-1 rounded">Decline</button>
                        ` : '<span class="text-gray-400 text-xs">—</span>'}
                    </td>
                </tr>
            `;
        }).join('');
    }

    window.fulfillRequisition = async (reqId) => {
        const req = cachedRequests.find(r => r.id === reqId);
        if (!req) return;

        if (!confirm(`Fulfill requisition ${req.request_code} for ${req.departments?.name}? This will automatically deduct Central Store stock and issue items to the department.`)) {
            return;
        }

        const storeDept = cachedDepts.find(d => d.dept_code === 'ST001');
        const storeDeptId = storeDept ? storeDept.id : '';
        const movementsToInsert = [];

        for (const it of req.stock_request_items) {
            movementsToInsert.push({
                item_id: it.item_id,
                department_id: storeDeptId,
                movement_type: 'Transfer to Department',
                direction: 'Out',
                quantity: it.quantity_requested,
                recipient_name: req.requested_by_name,
                transfer_to_dept_id: req.requesting_dept_id,
                reason: `Requisition fulfillment (${req.request_code}) issued to ${req.departments?.name}`,
                performed_by_name: currentUserName,
                performed_by_email: currentUserEmail,
                performed_by_dept: currentUserDeptCode
            });

            movementsToInsert.push({
                item_id: it.item_id,
                department_id: req.requesting_dept_id,
                movement_type: 'Transfer to Department',
                direction: 'In',
                quantity: it.quantity_requested,
                recipient_name: req.requested_by_name,
                reason: `Requisition receipt (${req.request_code}) from Central Store`,
                performed_by_name: currentUserName,
                performed_by_email: currentUserEmail,
                performed_by_dept: currentUserDeptCode
            });
        }

        const { error: moveErr } = await supabase.from('stock_movements').insert(movementsToInsert);
        if (moveErr) return alert('Error generating fulfillment movements: ' + moveErr.message);

        await supabase.from('stock_requests').update({ status: 'Fulfilled' }).eq('id', reqId);

        alert(`Requisition ${req.request_code} fulfilled successfully! Stock balances updated.`);
        loadRequisitions();
        refreshAllViews();
    };

    window.declineRequisition = async (reqId) => {
        if (!confirm('Decline this requisition?')) return;
        await supabase.from('stock_requests').update({ status: 'Declined' }).eq('id', reqId);
        loadRequisitions();
        loadActionCentre();
    };

    // --------------------------------------------------------------------------
    // 10. ASSET REGISTER (SAFEGUARDED ADMIN WAIVER AUTHORIZATION)
    // --------------------------------------------------------------------------
    async function loadAssets() {
        const tbody = document.getElementById('assets-table-body');
        let query = supabase.from('assets').select('*, departments(name, dept_code)').order('created_at', { ascending: false });

        if (currentUserDeptCode !== 'AD001' && currentUserDeptCode !== 'ST001') {
            const dept = cachedDepts.find(d => d.dept_code === currentUserDeptCode);
            if (dept) query = query.eq('department_id', dept.id);
        }

        const { data, error } = await query;
        if (error) {
            tbody.innerHTML = `<tr><td colspan="8" class="p-4 text-center text-red-500">Error: ${error.message}</td></tr>`;
            return;
        }

        cachedAssets = data || [];
        updateAssetCounters();
        renderAssetsTable();
    }

    function updateAssetCounters() {
        const total = cachedAssets.length;
        const present = cachedAssets.filter(a => a.status === 'In Store').length;
        const absent = cachedAssets.filter(a => a.status === 'Issued Out').length;
        const damaged = cachedAssets.filter(a => a.status === 'Damaged' || a.penalty_status !== 'None').length;

        document.getElementById('counter-asset-total').textContent = total;
        document.getElementById('counter-asset-present').textContent = present;
        document.getElementById('counter-asset-absent').textContent = absent;
        document.getElementById('counter-asset-damaged').textContent = damaged;
    }

    function renderAssetsTable() {
        const tbody = document.getElementById('assets-table-body');
        const search = document.getElementById('filter-assets-search').value.toLowerCase();
        const status = document.getElementById('filter-assets-status').value;
        const dept = document.getElementById('filter-assets-dept').value;
        const condition = document.getElementById('filter-assets-condition').value;

        const filtered = cachedAssets.filter(a => {
            const matchesSearch = !search || 
                a.item_name.toLowerCase().includes(search) || 
                (a.custodian && a.custodian.toLowerCase().includes(search)) ||
                (a.issued_to && a.issued_to.toLowerCase().includes(search)) ||
                (a.tag_or_serial && a.tag_or_serial.toLowerCase().includes(search));

            const matchesStatus = status === 'ALL' || a.status === status;
            const matchesDept = dept === 'ALL' || a.departments?.dept_code === dept;
            const matchesCond = condition === 'ALL' || a.condition === condition;

            return matchesSearch && matchesStatus && matchesDept && matchesCond;
        });

        if (!filtered.length) {
            tbody.innerHTML = '<tr><td colspan="8" class="p-6 text-center text-gray-400">No matching assets found.</td></tr>';
            return;
        }

        const isAdmin = currentUserDeptCode === 'AD001';

        tbody.innerHTML = filtered.map(a => {
            const isIssued = a.status === 'Issued Out';
            const hasPendingPenalty = a.penalty_status === 'Penalty Pending';

            return `
                <tr class="hover:bg-gray-50 border-b">
                    <td class="p-2.5 font-bold text-[#0b3b2c]">${a.item_name}</td>
                    <td class="p-2.5 text-xs text-gray-600">${a.departments?.name || 'Central'}</td>
                    <td class="p-2.5">
                        <span class="px-2 py-0.5 rounded text-xs font-semibold ${
                            a.status === 'In Store' ? 'bg-green-100 text-green-800' :
                            isIssued ? 'bg-amber-100 text-amber-900' : 'bg-red-100 text-red-800'
                        }">
                            ${a.status === 'In Store' ? '✓ In Store (Present)' : isIssued ? '⚠️ Issued Out' : a.status}
                        </span>
                    </td>
                    <td class="p-2.5 text-xs font-medium">
                        ${isIssued ? `<strong class="text-amber-900">${a.issued_to}</strong> <span class="text-gray-400 block text-[10px]">Since ${a.issued_date || ''}</span>` : a.custodian}
                    </td>
                    <td class="p-2.5"><span class="px-2 py-0.5 rounded text-xs bg-gray-100">${a.condition}</span></td>
                    <td class="p-2.5 text-xs font-mono text-gray-500">${a.tag_or_serial || '—'}</td>
                    <td class="p-2.5 text-xs">
                        ${a.penalty_status !== 'None' ? `
                            <span class="text-red-700 font-bold">${a.penalty_status}</span>: KES ${a.penalty_amount || 0}
                            ${a.waived_by_name ? `<span class="text-gray-500 block text-[10px]">Waived by ${a.waived_by_name}: ${a.waiver_notes || ''}</span>` : ''}
                        ` : '<span class="text-gray-400">—</span>'}
                    </td>
                    <td class="p-2.5 text-right space-x-1">
                        ${a.status === 'In Store' ? 
                            `<button onclick="window.openIssueModal('${a.id}')" class="text-xs bg-[#0b3b2c] hover:bg-[#07281c] text-white px-2 py-1 rounded">Issue Out</button>` : 
                            isIssued ? `<button onclick="window.openReturnModal('${a.id}')" class="text-xs bg-amber-600 hover:bg-amber-700 text-white px-2 py-1 rounded font-semibold">Process Return</button>` :
                            isAdmin && hasPendingPenalty ? `<button onclick="window.openWaiverModal('${a.id}')" class="text-xs bg-red-700 hover:bg-red-800 text-white font-bold px-2 py-1 rounded">Review / Waive</button>` :
                            '<span class="text-gray-400 text-xs">—</span>'
                        }
                    </td>
                </tr>
            `;
        }).join('');
    }

    window.openIssueModal = (assetId) => {
        const asset = cachedAssets.find(a => a.id === assetId);
        if (!asset) return;

        document.getElementById('issue_asset_id').value = asset.id;
        document.getElementById('issue_asset_name').value = `${asset.item_name} [${asset.tag_or_serial || 'No Tag'}]`;
        document.getElementById('issue_date').value = new Date().toISOString().slice(0, 10);
        showModal('modal-issue-asset');
    };

    document.getElementById('form-issue-asset').addEventListener('submit', async (e) => {
        e.preventDefault();
        const assetId = document.getElementById('issue_asset_id').value;
        const payload = {
            status: 'Issued Out',
            issued_to: document.getElementById('issue_custodian_name').value.trim(),
            issued_date: document.getElementById('issue_date').value
        };

        const { error } = await supabase.from('assets').update(payload).eq('id', assetId);
        if (error) {
            alert('Error issuing asset: ' + error.message);
        } else {
            alert('Asset custody handover recorded successfully!');
            hideModal('modal-issue-asset');
            loadAssets();
        }
    });

    window.openReturnModal = (assetId) => {
        const asset = cachedAssets.find(a => a.id === assetId);
        if (!asset) return;

        document.getElementById('return_asset_id').value = asset.id;
        document.getElementById('return_asset_name').value = `${asset.item_name} (Held by ${asset.issued_to || 'Staff'})`;
        document.getElementById('return_date').value = new Date().toISOString().slice(0, 10);
        document.getElementById('penalty-waiver-block').style.display = 'none';
        showModal('modal-return-asset');
    };

    document.getElementById('return_condition').addEventListener('change', (e) => {
        const val = e.target.value;
        document.getElementById('penalty-waiver-block').style.display = ['Damaged', 'Lost'].includes(val) ? 'block' : 'none';
    });

    // Department Operators can log returns, but cannot waive
    document.getElementById('form-return-asset').addEventListener('submit', async (e) => {
        e.preventDefault();
        const assetId = document.getElementById('return_asset_id').value;
        const condition = document.getElementById('return_condition').value;
        const isFaulty = ['Damaged', 'Lost'].includes(condition);

        const payload = {
            status: isFaulty ? condition : 'In Store',
            return_condition: condition,
            return_date: document.getElementById('return_date').value,
            issued_to: isFaulty ? document.getElementById('return_asset_name').value : null,
            penalty_status: isFaulty ? 'Penalty Pending' : 'None',
            penalty_amount: isFaulty ? parseFloat(document.getElementById('return_penalty_amount').value) || 0 : 0,
            waiver_notes: isFaulty ? document.getElementById('return_waiver_notes').value.trim() : null
        };

        const { error } = await supabase.from('assets').update(payload).eq('id', assetId);
        if (error) {
            alert('Error recording return: ' + error.message);
        } else {
            alert(isFaulty ? 'Asset marked as damaged/lost. Liability is flagged for Admin Dorothy to review.' : 'Asset returned and cleared back into store inventory.');
            hideModal('modal-return-asset');
            loadAssets();
        }
    });

    // Admin-Only Safeguarded Waiver Modal
    window.openWaiverModal = (assetId) => {
        const asset = cachedAssets.find(a => a.id === assetId);
        if (!asset) return;

        document.getElementById('waiver_asset_id').value = asset.id;
        document.getElementById('waiver_asset_name').value = `${asset.item_name} [${asset.tag_or_serial || 'No Tag'}]`;
        document.getElementById('waiver_penalty_amount').value = asset.penalty_amount || 0;
        document.getElementById('waiver_admin_password').value = '';
        document.getElementById('waiver_reason').value = '';

        showModal('modal-admin-waiver');
    };

    document.getElementById('form-admin-waiver').addEventListener('submit', async (e) => {
        e.preventDefault();

        const assetId = document.getElementById('waiver_asset_id').value;
        const reason = document.getElementById('waiver_reason').value.trim();
        const enteredPassword = document.getElementById('waiver_admin_password').value;

        // Re-authenticate Admin Dorothy before waiver execution
        const { error: authErr } = await supabase.auth.signInWithPassword({
            email: currentUserEmail,
            password: enteredPassword
        });

        if (authErr) {
            alert('Authorization Failed: Invalid Admin Password. Waiver not executed.');
            return;
        }

        const payload = {
            penalty_status: 'Waived by Admin',
            waiver_notes: reason,
            waived_by_name: currentUserName,
            waived_by_email: currentUserEmail,
            waived_at: new Date().toISOString()
        };

        const { error: updateErr } = await supabase.from('assets').update(payload).eq('id', assetId);
        if (updateErr) {
            alert('Error applying waiver: ' + updateErr.message);
        } else {
            alert('Waiver officially authorized and logged in the audit trail.');
            hideModal('modal-admin-waiver');
            loadAssets();
        }
    });

    // --------------------------------------------------------------------------
    // 11. ITEM MASTER & QUICK PRICE EDITOR (ADMIN ONLY)
    // --------------------------------------------------------------------------
    window.openQuickEditItem = (itemId) => {
        const item = cachedItems.find(i => i.id === itemId);
        if (!item) return;

        document.getElementById('edit_item_id').value = item.id;
        document.getElementById('edit_item_name').value = item.name;
        document.getElementById('edit_item_unit').value = item.unit;
        document.getElementById('edit_item_category').value = item.category;
        document.getElementById('edit_item_cost').value = item.last_purchase_price || item.standard_cost || 0;
        document.getElementById('edit_item_reorder').value = item.reorder_level || 5;
        document.getElementById('edit_item_perishable').checked = !!item.is_perishable;

        showModal('modal-quick-edit-item');
    };

    document.getElementById('form-quick-edit-item').addEventListener('submit', async (e) => {
        e.preventDefault();
        const itemId = document.getElementById('edit_item_id').value;
        const cost = parseFloat(document.getElementById('edit_item_cost').value) || 0;

        const payload = {
            name: document.getElementById('edit_item_name').value.trim(),
            unit: document.getElementById('edit_item_unit').value.trim(),
            category: document.getElementById('edit_item_category').value,
            standard_cost: cost,
            last_purchase_price: cost,
            reorder_level: parseFloat(document.getElementById('edit_item_reorder').value) || 5,
            is_perishable: document.getElementById('edit_item_perishable').checked
        };

        const { error } = await supabase.from('items').update(payload).eq('id', itemId);
        if (error) {
            alert('Error updating commodity: ' + error.message);
        } else {
            alert('Item amendments and price updated successfully across the system!');
            hideModal('modal-quick-edit-item');
            await loadMasterMetadata();
            refreshAllViews();
        }
    });

    // Create New Item Modal Submit
    document.getElementById('form-create-item').addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = {
            name: document.getElementById('new_item_name').value.trim(),
            unit: document.getElementById('new_item_unit').value.trim(),
            category: document.getElementById('new_item_category').value,
            reorder_level: parseFloat(document.getElementById('new_item_reorder').value) || 5,
            standard_cost: parseFloat(document.getElementById('new_item_cost').value) || 0,
            last_purchase_price: parseFloat(document.getElementById('new_item_cost').value) || 0,
            is_perishable: document.getElementById('new_item_perishable').checked
        };

        const { data, error } = await supabase.from('items').insert([payload]).select().single();
        if (error) {
            alert('Error adding item: ' + error.message);
        } else {
            alert(`Item "${payload.name}" successfully created!`);
            document.getElementById('form-create-item').reset();
            hideModal('modal-new-item');
            await loadMasterMetadata();

            if (data && data.id) {
                document.getElementById('item_search_input').value = `${data.name} (${data.unit})`;
                document.getElementById('item_id').value = data.id;
            }
        }
    });

    // --------------------------------------------------------------------------
    // 12. DONORS DIRECTORY & SORTING (ADMIN ONLY)
    // --------------------------------------------------------------------------
    function openDonorEditor(donorId = null) {
        document.getElementById('form-donor-editor').reset();
        document.getElementById('edit_donor_id').value = donorId || '';

        if (donorId) {
            const d = cachedDonors.find(donor => donor.id === donorId);
            if (d) {
                document.getElementById('donor_full_name').value = d.name;
                document.getElementById('donor_phone_number').value = d.phone_number || '';
                document.getElementById('donor_contact_info').value = d.contact_info || '';
                document.getElementById('modal-donor-title').textContent = 'Edit Donor Details';
            }
        } else {
            document.getElementById('modal-donor-title').textContent = 'Register New Donor';
        }
        showModal('modal-donor-editor');
    }

    document.getElementById('form-donor-editor').addEventListener('submit', async (e) => {
        e.preventDefault();
        const donorId = toValidUUID(document.getElementById('edit_donor_id').value);
        const payload = {
            name: document.getElementById('donor_full_name').value.trim(),
            phone_number: document.getElementById('donor_phone_number').value.trim(),
            contact_info: document.getElementById('donor_contact_info').value.trim()
        };

        let result;
        if (donorId) {
            result = await supabase.from('donors').update(payload).eq('id', donorId);
        } else {
            result = await supabase.from('donors').insert([payload]).select().single();
        }

        if (result.error) {
            alert('Error saving donor: ' + result.error.message);
        } else {
            alert('Donor profile saved successfully!');
            hideModal('modal-donor-editor');
            await loadMasterMetadata();
            loadDonorsDirectory();

            if (!donorId && result.data) {
                document.getElementById('donor_search_input').value = `[${result.data.donor_code || 'DNR'}] ${result.data.name}`;
                document.getElementById('donor_id').value = result.data.id;
            }
        }
    });

    async function loadDonorsDirectory() {
        if (currentUserDeptCode !== 'AD001') return;

        const tbody = document.getElementById('donors-table-body');
        const { data, error } = await supabase.from('donor_summary_view').select('*');
        if (error) {
            tbody.innerHTML = `<tr><td colspan="7" class="p-4 text-center text-red-500">Error: ${error.message}</td></tr>`;
            return;
        }

        cachedDonors = data || [];
        populateSearchableComboboxes();
        renderDonorsTable();
    }

    function renderDonorsTable() {
        const tbody = document.getElementById('donors-table-body');
        const search = document.getElementById('filter-donor-search').value.toLowerCase();
        const sortBy = document.getElementById('sort-donor-activity').value;

        let filtered = cachedDonors.filter(d => {
            return !search || 
                (d.donor_code && d.donor_code.toLowerCase().includes(search)) ||
                (d.donor_name && d.donor_name.toLowerCase().includes(search)) ||
                (d.phone_number && d.phone_number.toLowerCase().includes(search));
        });

        filtered.sort((a, b) => {
            const dateA = a.last_donation_date ? new Date(a.last_donation_date).getTime() : 0;
            const dateB = b.last_donation_date ? new Date(b.last_donation_date).getTime() : 0;

            if (sortBy === 'LATEST_FIRST') return dateB - dateA;
            if (sortBy === 'OLDEST_FIRST') return dateA - dateB;
            if (sortBy === 'NAME_ASC') return a.donor_name.localeCompare(b.donor_name);
            return 0;
        });

        if (!filtered.length) {
            tbody.innerHTML = '<tr><td colspan="7" class="p-6 text-center text-gray-400">No donors match criteria.</td></tr>';
            return;
        }

        tbody.innerHTML = filtered.map(d => {
            const lastDate = d.last_donation_date 
                ? new Date(d.last_donation_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) 
                : '<span class="text-gray-400">No donations yet</span>';

            return `
                <tr class="hover:bg-gray-50 border-b">
                    <td class="p-2.5 font-mono font-bold text-[#0b3b2c]">${d.donor_code || 'DNR'}</td>
                    <td class="p-2.5 font-bold text-gray-900">${d.donor_name}</td>
                    <td class="p-2.5 font-mono text-gray-700">${d.phone_number || '—'}</td>
                    <td class="p-2.5 text-gray-500">${d.contact_info || '—'}</td>
                    <td class="p-2.5 font-medium text-emerald-800">${lastDate}</td>
                    <td class="p-2.5 font-mono font-bold text-center">${d.total_donation_instances || 0}</td>
                    <td class="p-2.5 text-right">
                        <button onclick="window.triggerEditDonor('${d.donor_id}')" class="text-xs bg-gray-100 hover:bg-gray-200 px-2.5 py-1 rounded text-gray-700 font-semibold">Edit Details</button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    window.triggerEditDonor = (id) => openDonorEditor(id);
    document.getElementById('filter-donor-search').addEventListener('input', renderDonorsTable);
    document.getElementById('sort-donor-activity').addEventListener('change', renderDonorsTable);

    // --------------------------------------------------------------------------
    // 13. REPLENISHMENT LIST (UNIVERSAL)
    // --------------------------------------------------------------------------
    async function loadReplenishmentList() {
        const tbody = document.getElementById('replenishment-table-body');
        const budgetElem = document.getElementById('total-market-budget');

        const { data, error } = await supabase.from('replenishment_needed_view').select('*');
        if (error) {
            tbody.innerHTML = `<tr><td colspan="8" class="text-center p-4 text-red-500">Error: ${error.message}</td></tr>`;
            return;
        }

        if (!data || !data.length) {
            tbody.innerHTML = `<tr><td colspan="8" class="text-center p-6 text-emerald-700 font-semibold">🎉 All items are adequately stocked! No replenishment required.</td></tr>`;
            budgetElem.textContent = 'Estimated Budget: KES 0.00';
            return;
        }

        let totalEst = 0;
        tbody.innerHTML = data.map(r => {
            totalEst += Number(r.estimated_cost);
            const isFarm = r.category === 'Farm Produce';
            const unitPrice = Number(r.effective_unit_price ?? r.standard_cost ?? 0);

            return `
                <tr class="hover:bg-amber-50/50 border-b">
                    <td class="p-2.5 font-bold text-gray-900">${r.item_name}</td>
                    <td class="p-2.5 text-gray-500">${r.category}</td>
                    <td class="p-2.5 font-mono text-red-700 font-semibold">${Number(r.current_stock).toFixed(1)} ${r.unit}</td>
                    <td class="p-2.5 font-mono text-gray-600">${r.reorder_level} ${r.unit}</td>
                    <td class="p-2.5 font-mono font-black text-[#e85d04]">${Number(r.suggested_reorder_qty).toFixed(1)} ${r.unit}</td>
                    <td class="p-2.5">
                        <span class="px-2 py-0.5 rounded text-[11px] font-semibold ${isFarm ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}">
                            ${r.procurement_source || 'Purchase at Market'}
                        </span>
                    </td>
                    <td class="p-2.5 font-mono text-gray-700">KES ${unitPrice.toFixed(2)}</td>
                    <td class="p-2.5 text-right font-mono font-bold text-[#0b3b2c]">KES ${Number(r.estimated_cost).toFixed(2)}</td>
                </tr>
            `;
        }).join('');

        budgetElem.textContent = `Estimated Market Budget: KES ${totalEst.toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;
    }

    // --------------------------------------------------------------------------
    // 14. CENTRAL BALANCES & ORGANIZATION INVENTORY VIEW
    // --------------------------------------------------------------------------
    async function loadStockBalances() {
        const tbody = document.getElementById('balances-table-body');
        let query = supabase.from('current_stock_balances').select('*').order('item_name');

        if (currentUserDeptCode !== 'AD001' && currentUserDeptCode !== 'ST001') {
            query = query.eq('dept_code', currentUserDeptCode);
            document.getElementById('stock-scope-desc').textContent = `Showing commodities allocated exclusively to [${currentUserDeptCode}]`;
        }

        const { data, error } = await query;
        if (error) {
            tbody.innerHTML = `<tr><td colspan="8" class="text-center p-4 text-red-500">Error: ${error.message}</td></tr>`;
            return;
        }

        cachedBalances = data || [];
        updateOrganizationValuation();
        renderStockBalancesTable();
    }

    async function updateOrganizationValuation() {
        if (currentUserDeptCode !== 'AD001') return;

        const { data: orgData } = await supabase.from('master_inventory_summary_view').select('*');
        if (!orgData) return;

        const totalItems = orgData.length;
        const centralTotal = orgData.reduce((sum, i) => sum + Number(i.central_store_stock), 0);
        const deptTotal = orgData.reduce((sum, i) => sum + Number(i.departments_stock), 0);
        const totalValuation = orgData.reduce((sum, i) => sum + Number(i.total_valuation_kes), 0);

        document.getElementById('counter-total-items').textContent = totalItems;
        document.getElementById('counter-central-stock').textContent = centralTotal.toFixed(1);
        document.getElementById('counter-dept-stock').textContent = deptTotal.toFixed(1);
        document.getElementById('counter-total-valuation').textContent = `KES ${totalValuation.toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;
    }

    function renderStockBalancesTable() {
        const tbody = document.getElementById('balances-table-body');
        const search = document.getElementById('filter-stock-search').value.toLowerCase();
        const dept = document.getElementById('filter-stock-dept').value;
        const cat = document.getElementById('filter-stock-category').value;
        const health = document.getElementById('filter-stock-health').value;

        const filtered = cachedBalances.filter(r => {
            const matchesSearch = !search || r.item_name.toLowerCase().includes(search);
            const matchesDept = dept === 'ALL' || r.dept_code === dept;
            const matchesCat = cat === 'ALL' || r.category === cat;
            const isLow = r.balance <= r.reorder_level;
            const matchesHealth = health === 'ALL' || (health === 'LOW' ? isLow : !isLow);

            return matchesSearch && matchesDept && matchesCat && matchesHealth;
        });

        if (!filtered.length) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center p-6 text-gray-400">No stock commodities match criteria.</td></tr>';
            return;
        }

        const isAdmin = currentUserDeptCode === 'AD001';

        tbody.innerHTML = filtered.map(r => {
            const isLow = r.balance <= r.reorder_level;
            const unitPrice = Number(r.standard_cost || 0);
            const totalValuation = Number(r.balance * unitPrice);

            return `
                <tr class="hover:bg-gray-50 border-b">
                    <td class="p-3 font-semibold text-gray-900">${r.item_name}</td>
                    <td class="p-3 text-xs text-gray-500">${r.category}</td>
                    <td class="p-3 text-xs font-medium text-[#0b3b2c]">${r.department_name}</td>
                    <td class="p-3 font-mono font-bold text-sm ${isLow ? 'text-red-600' : 'text-[#0b3b2c]'}">
                        ${Number(r.balance).toFixed(2)} <span class="text-xs font-normal text-gray-500">${r.unit}</span>
                    </td>
                    <td class="p-3 font-mono text-xs text-gray-700">KES ${unitPrice.toFixed(2)}</td>
                    <td class="p-3 font-mono text-xs font-bold text-gray-800">KES ${totalValuation.toLocaleString('en-KE', { minimumFractionDigits: 2 })}</td>
                    <td class="p-3">
                        <span class="px-2 py-0.5 rounded text-xs font-semibold ${isLow ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}">
                            ${isLow ? '⚠️ Low Stock' : '✓ Healthy'}
                        </span>
                    </td>
                    <td class="p-3 text-right">
                        ${isAdmin ? `<button onclick="window.openQuickEditItem('${r.item_id}')" class="text-xs bg-gray-100 hover:bg-emerald-100 text-[#0b3b2c] font-bold px-2 py-1 rounded transition">✏️ Edit</button>` : '<span class="text-gray-400 text-xs">—</span>'}
                    </td>
                </tr>
            `;
        }).join('');
    }

    // --------------------------------------------------------------------------
    // 15. MOVEMENT LEDGER (POSTGREST AMBIGUITY FIXED)
    // --------------------------------------------------------------------------
    async function loadLedgerRecords() {
        const tbody = document.getElementById('ledger-table-body');
        
        // Exact Relationship Specified: departments!department_id
        let query = supabase.from('stock_movements')
            .select('*, items(name, unit), departments!department_id(name, dept_code), transfer_dept:departments!transfer_to_dept_id(name)')
            .order('created_at', { ascending: false })
            .limit(150);

        if (currentUserDeptCode !== 'AD001' && currentUserDeptCode !== 'ST001') {
            const dept = cachedDepts.find(d => d.dept_code === currentUserDeptCode);
            if (dept) query = query.eq('department_id', dept.id);
        }

        const { data, error } = await query;
        if (error) {
            tbody.innerHTML = `<tr><td colspan="8" class="text-center p-4 text-red-500">Error loading ledger: ${error.message}</td></tr>`;
            return;
        }

        cachedMovements = data || [];
        renderLedgerTable();
    }

    function renderLedgerTable() {
        const tbody = document.getElementById('ledger-table-body');
        const search = document.getElementById('filter-ledger-search').value.toLowerCase();
        const moveType = document.getElementById('filter-ledger-type').value;
        const dept = document.getElementById('filter-ledger-dept').value;
        const dateVal = document.getElementById('filter-ledger-date').value;

        const filtered = cachedMovements.filter(m => {
            const matchesSearch = !search || 
                (m.txn_code && m.txn_code.toLowerCase().includes(search)) ||
                (m.items?.name && m.items.name.toLowerCase().includes(search)) ||
                (m.performed_by_name && m.performed_by_name.toLowerCase().includes(search)) ||
                (m.recipient_name && m.recipient_name.toLowerCase().includes(search)) ||
                (m.reason && m.reason.toLowerCase().includes(search));

            const matchesType = moveType === 'ALL' || m.movement_type === moveType;
            const matchesDept = dept === 'ALL' || m.departments?.dept_code === dept;
            const matchesDate = !dateVal || m.created_at.startsWith(dateVal);

            return matchesSearch && matchesType && matchesDept && matchesDate;
        });

        if (!filtered.length) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center p-6 text-gray-400">No ledger records match filters.</td></tr>';
            return;
        }

        tbody.innerHTML = filtered.map(m => {
            const dateStr = new Date(m.created_at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' });
            const isIn = m.direction === 'In';
            return `
                <tr class="hover:bg-gray-50 border-b">
                    <td class="p-2.5 font-mono font-bold text-gray-700">${m.txn_code || '—'}</td>
                    <td class="p-2.5 text-gray-500 whitespace-nowrap">${dateStr}</td>
                    <td class="p-2.5">
                        <span class="px-2 py-0.5 rounded text-xs font-semibold ${
                            m.movement_type === 'Top-up' ? 'bg-orange-100 text-orange-800' :
                            m.movement_type === 'Transfer to Department' ? 'bg-blue-100 text-blue-900 font-bold' :
                            isIn ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-800'
                        }">
                            ${m.movement_type}
                        </span>
                    </td>
                    <td class="p-2.5 font-bold">${m.items?.name || 'Item'}</td>
                    <td class="p-2.5 text-xs text-gray-600">${m.departments?.name || 'Central'}</td>
                    <td class="p-2.5 font-mono font-bold ${isIn ? 'text-green-700' : 'text-red-700'}">
                        ${isIn ? '+' : '-'}${m.quantity} ${m.items?.unit || ''}
                    </td>
                    <td class="p-2.5 text-xs text-gray-700">
                        ${m.recipient_name ? `<strong>Recipient: ${m.recipient_name}</strong> · ` : ''}
                        ${m.reason || ''} 
                        ${m.people_count ? `(${m.people_count} people)` : ''}
                    </td>
                    <td class="p-2.5 text-xs text-gray-700 font-medium">
                        ${m.performed_by_name} <br>
                        <span class="text-gray-400 font-mono text-[10px]">${m.performed_by_email || m.performed_by_dept}</span>
                    </td>
                </tr>
            `;
        }).join('');
    }

    async function loadDonationRegister() {
        if (currentUserDeptCode !== 'AD001') return;

        const tbody = document.getElementById('donations-table-body');
        const { data, error } = await supabase.from('donation_register_view').select('*').order('date_received', { ascending: false });

        if (error) {
            tbody.innerHTML = `<tr><td colspan="8" class="text-center p-4 text-red-500">Error: ${error.message}</td></tr>`;
            return;
        }

        cachedDonations = data || [];
        renderDonationsTable();
    }

    function renderDonationsTable() {
        const tbody = document.getElementById('donations-table-body');
        const search = document.getElementById('filter-donations-search').value.toLowerCase();
        const intent = document.getElementById('filter-donations-intent').value;
        const status = document.getElementById('filter-donations-status').value;

        const filtered = cachedDonations.filter(d => {
            const matchesSearch = !search || 
                d.donation_ref.toLowerCase().includes(search) || 
                d.donor_name.toLowerCase().includes(search) ||
                d.item_name.toLowerCase().includes(search);

            const matchesIntent = intent === 'ALL' || (intent === 'Unrestricted' ? d.donor_intent === 'Unrestricted' : d.donor_intent !== 'Unrestricted');
            const hasRemaining = d.remaining_balance > 0;
            const matchesStatus = status === 'ALL' || (status === 'AVAILABLE' ? hasRemaining : !hasRemaining);

            return matchesSearch && matchesIntent && matchesStatus;
        });

        if (!filtered.length) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center p-6 text-gray-400">No donations match filters.</td></tr>';
            return;
        }

        tbody.innerHTML = filtered.map(d => `
            <tr class="hover:bg-gray-50 border-b">
                <td class="p-2.5 font-mono font-bold text-orange-950">${d.donation_ref}</td>
                <td class="p-2.5 font-medium">${d.donor_name}</td>
                <td class="p-2.5">${d.item_name}</td>
                <td class="p-2.5 text-xs font-semibold ${d.donor_intent === 'Unrestricted' ? 'text-emerald-700' : 'text-blue-700'}">${d.donor_intent}</td>
                <td class="p-2.5"><span class="px-2 py-0.5 rounded text-xs bg-gray-100 font-medium">${d.item_condition || 'Good'}</span></td>
                <td class="p-2.5 font-mono text-green-700">${Number(d.total_received).toFixed(1)} ${d.unit}</td>
                <td class="p-2.5 font-mono text-red-700">${Number(d.total_used).toFixed(1)} ${d.unit}</td>
                <td class="p-2.5 font-mono font-bold text-[#0b3b2c]">${Number(d.remaining_balance).toFixed(1)} ${d.unit}</td>
            </tr>
        `).join('');
    }

    async function loadStaffAccounts() {
        if (currentUserDeptCode !== 'AD001') return;

        const tbody = document.getElementById('staff-table-body');
        const { data, error } = await supabase.from('staff_profiles').select('*').order('dept_code');

        if (error) {
            tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-red-500">Error: ${error.message}</td></tr>`;
            return;
        }

        cachedStaff = data || [];
        tbody.innerHTML = cachedStaff.map(s => `
            <tr class="hover:bg-gray-50 border-b">
                <td class="p-2.5 font-mono font-bold text-emerald-950">${s.dept_code}</td>
                <td class="p-2.5 font-semibold text-gray-800">${s.staff_name}</td>
                <td class="p-2.5 text-gray-600 font-mono">${s.email}</td>
                <td class="p-2.5"><span class="px-2 py-0.5 rounded text-xs bg-gray-100 font-medium">${s.role}</span></td>
                <td class="p-2.5">
                    <span class="px-2 py-0.5 rounded text-xs font-semibold ${s.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">
                        ${s.is_active ? 'Active' : 'Inactive'}
                    </span>
                </td>
                <td class="p-2.5 text-right space-x-1">
                    <button onclick="window.triggerEditStaff('${s.id}')" class="text-xs bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded text-gray-700 font-semibold">Edit</button>
                    <button onclick="window.triggerToggleStaff('${s.id}', ${s.is_active})" class="text-xs ${s.is_active ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-green-50 text-green-600 hover:bg-green-100'} px-2 py-1 rounded font-semibold">
                        ${s.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                </td>
            </tr>
        `).join('');
    }

    document.getElementById('form-create-staff').addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = {
            staff_name: document.getElementById('new_staff_name').value.trim(),
            dept_code: document.getElementById('new_staff_dept').value,
            role: document.getElementById('new_staff_role').value,
            email: document.getElementById('new_staff_email').value.trim().toLowerCase(),
            is_active: true
        };

        const { error } = await supabase.from('staff_profiles').insert([payload]);
        if (error) {
            alert('Error creating staff: ' + error.message);
        } else {
            alert('Staff member registered successfully!');
            document.getElementById('form-create-staff').reset();
            hideModal('modal-new-staff');
            loadStaffAccounts();
        }
    });

    window.triggerEditStaff = (staffId) => {
        const staff = cachedStaff.find(s => s.id === staffId);
        if (!staff) return;

        document.getElementById('edit_staff_id').value = staff.id;
        document.getElementById('edit_staff_name').value = staff.staff_name;
        document.getElementById('edit_staff_dept').value = staff.dept_code;
        document.getElementById('edit_staff_role').value = staff.role;
        document.getElementById('edit_staff_active').checked = staff.is_active;

        showModal('modal-edit-staff');
    };

    window.triggerToggleStaff = async (staffId, currentStatus) => {
        if (!confirm(`Are you sure you want to ${currentStatus ? 'deactivate' : 'activate'} this account?`)) return;

        const { error } = await supabase.from('staff_profiles').update({ is_active: !currentStatus }).eq('id', staffId);
        if (error) {
            alert('Error updating status: ' + error.message);
        } else {
            loadStaffAccounts();
        }
    };

    document.getElementById('form-edit-staff').addEventListener('submit', async (e) => {
        e.preventDefault();
        const staffId = document.getElementById('edit_staff_id').value;
        const payload = {
            staff_name: document.getElementById('edit_staff_name').value.trim(),
            dept_code: document.getElementById('edit_staff_dept').value,
            role: document.getElementById('edit_staff_role').value,
            is_active: document.getElementById('edit_staff_active').checked,
            updated_at: new Date().toISOString()
        };

        const { error } = await supabase.from('staff_profiles').update(payload).eq('id', staffId);
        if (error) {
            alert('Error updating staff: ' + error.message);
        } else {
            alert('Staff details updated successfully!');
            hideModal('modal-edit-staff');
            loadStaffAccounts();
        }
    });

    // --------------------------------------------------------------------------
    // 16. FILTERS & EVENT LISTENERS
    // --------------------------------------------------------------------------
    function setupFilters() {
        ['filter-stock-search', 'filter-stock-category', 'filter-stock-dept', 'filter-stock-health'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('input', renderStockBalancesTable);
        });

        ['filter-ledger-search', 'filter-ledger-type', 'filter-ledger-dept', 'filter-ledger-date'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('input', renderLedgerTable);
        });

        ['filter-donations-search', 'filter-donations-intent', 'filter-donations-status'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('input', renderDonationsTable);
        });

        ['filter-assets-search', 'filter-assets-status', 'filter-assets-dept', 'filter-assets-condition'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('input', renderAssetsTable);
        });
    }

    function refreshAllViews() {
        loadActionCentre();
        loadStockBalances();
        loadLedgerRecords();
        loadRequisitions();
        loadReplenishmentList();
        loadAssets();
        if (currentUserDeptCode === 'AD001') {
            loadDonationRegister();
            loadDonorsDirectory();
            loadStaffAccounts();
        }
    }

    // --------------------------------------------------------------------------
    // 17. CSV EXPORT UTILITIES
    // --------------------------------------------------------------------------
    function downloadCSV(csvContent, fileName) {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', fileName);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    document.getElementById('btn-export-donors').addEventListener('click', async () => {
        if (currentUserDeptCode !== 'AD001') return;
        const { data } = await supabase.from('donor_summary_view').select('*').order('last_donation_date', { ascending: false });
        if (!data || !data.length) return alert('No donors to export.');

        let csv = 'Donor Code,Donor Name,Phone Number,Contact Details,Last Active Donation Date,Total Donations Given\n';
        data.forEach(d => {
            csv += `"${d.donor_code}","${d.donor_name}","${d.phone_number || ''}","${d.contact_info || ''}","${d.last_donation_date || 'No Donations'}","${d.total_donation_instances}"\n`;
        });
        downloadCSV(csv, `Amys_House_Donors_Directory_${new Date().toISOString().slice(0,10)}.csv`);
    });

    document.getElementById('btn-export-replenish').addEventListener('click', async () => {
        const { data } = await supabase.from('replenishment_needed_view').select('*');
        if (!data || !data.length) return alert('No replenishment items to export.');

        let csv = 'Item Name,Category,Current Stock,Reorder Level,Recommended Buy Qty,Unit,Procurement Channel,Unit Cost (KES),Total Estimated Budget (KES)\n';
        data.forEach(r => {
            const unitPrice = Number(r.effective_unit_price ?? r.standard_cost ?? 0);
            csv += `"${r.item_name}","${r.category}",${r.current_stock},${r.reorder_level},${r.suggested_reorder_qty},"${r.unit}","${r.procurement_source}",${unitPrice},${r.estimated_cost}\n`;
        });
        downloadCSV(csv, `Amys_House_Market_Shopping_List_${new Date().toISOString().slice(0,10)}.csv`);
    });

    document.getElementById('btn-export-stock').addEventListener('click', async () => {
        const { data } = await supabase.from('current_stock_balances').select('*');
        if (!data || !data.length) return alert('No stock data to export.');

        let csv = 'Item Name,Category,Storage Location,Balance,Unit,Reorder Level,Unit Cost,Valuation (KES)\n';
        data.forEach(r => {
            const unitCost = Number(r.standard_cost || 0);
            const val = Number(r.balance * unitCost);
            csv += `"${r.item_name}","${r.category}","${r.department_name}",${r.balance},"${r.unit}",${r.reorder_level},${unitCost},${val}\n`;
        });
        downloadCSV(csv, `Amys_House_Stock_Balances_${new Date().toISOString().slice(0,10)}.csv`);
    });

    document.getElementById('btn-export-ledger').addEventListener('click', async () => {
        const { data } = await supabase.from('stock_movements').select('*, items(name, unit), departments!department_id(name)');
        if (!data || !data.length) return alert('No movements to export.');

        let csv = 'Txn Code,Timestamp,Movement Type,Direction,Item,Quantity,Unit,Department,Recipient / Purpose,Reason,Operator Name,Operator Account\n';
        data.forEach(m => {
            csv += `"${m.txn_code || ''}","${m.created_at}","${m.movement_type}","${m.direction}","${m.items?.name}",${m.quantity},"${m.items?.unit}","${m.departments?.name}","${m.recipient_name || ''}","${m.reason || ''}","${m.performed_by_name}","${m.performed_by_email}"\n`;
        });
        downloadCSV(csv, `Amys_House_Audit_Ledger_${new Date().toISOString().slice(0,10)}.csv`);
    });

    document.getElementById('btn-export-donations').addEventListener('click', async () => {
        if (currentUserDeptCode !== 'AD001') return;
        const { data } = await supabase.from('donation_register_view').select('*');
        if (!data || !data.length) return alert('No donations to export.');

        let csv = 'Ref No,Donor,Item,Intent,Condition,Total Received,Total Used,Remaining,Unit\n';
        data.forEach(d => {
            csv += `"${d.donation_ref}","${d.donor_name}","${d.item_name}","${d.donor_intent}","${d.item_condition}",${d.total_received},${d.total_used},${d.remaining_balance},"${d.unit}"\n`;
        });
        downloadCSV(csv, `Amys_House_Donation_Register_${new Date().toISOString().slice(0,10)}.csv`);
    });

    document.getElementById('btn-export-assets').addEventListener('click', async () => {
        const { data } = await supabase.from('assets').select('*, departments(name)');
        if (!data || !data.length) return alert('No assets to export.');

        let csv = 'Asset Name,Department,Status,Custodian,Issued To,Issued Date,Return Condition,Penalty Status,Penalty Amount (KES),Serial Tag,Waived By,Waiver Notes\n';
        data.forEach(a => {
            csv += `"${a.item_name}","${a.departments?.name}","${a.status}","${a.custodian}","${a.issued_to || ''}","${a.issued_date || ''}","${a.return_condition || ''}","${a.penalty_status}","${a.penalty_amount}","${a.tag_or_serial || ''}","${a.waived_by_name || ''}","${a.waiver_notes || ''}"\n`;
        });
        downloadCSV(csv, `Amys_House_Assets_${new Date().toISOString().slice(0,10)}.csv`);
    });

    // --------------------------------------------------------------------------
    // 18. NETWORK STATUS MONITOR
    // --------------------------------------------------------------------------
    const syncStatus = document.getElementById('sync-status');
    window.addEventListener('online', () => {
        syncStatus.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-400"></span> Online';
        syncStatus.className = 'bg-emerald-800 border border-emerald-600 px-2.5 py-1 rounded-full text-emerald-100 flex items-center gap-1.5';
    });
    window.addEventListener('offline', () => {
        syncStatus.innerHTML = '<span class="w-2 h-2 rounded-full bg-amber-400"></span> Offline (Cached)';
        syncStatus.className = 'bg-amber-800 border border-amber-600 px-2.5 py-1 rounded-full text-amber-100 flex items-center gap-1.5';
    });
});
