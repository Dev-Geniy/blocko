// ==========================================
// Blocko Pro · доска — tables.js
// Таблицы (Excel-стиль)
// Классический скрипт: объявления видны глобально (нужно для inline-обработчиков).
// Порядок подключения важен — см. board.html.
// ==========================================

// --- ЛОГИКА ТАБЛИЦ (EXCEL STYLE) ---
let activeTableData = null; // { colId, cardId, rows, cols, data[][] }

function prepareTableCreation() {
  closeMoreAddModal();
  const modal = document.getElementById('tableConstructorModal');
  const content = document.getElementById('tableConstructorContent');
  modal.classList.remove('hidden');
  setTimeout(() => { modal.classList.remove('opacity-0'); content.classList.remove('scale-95'); content.classList.add('scale-100'); }, 10);
  document.getElementById('tableTitle').focus();
}

function closeTableConstructor() {
  const modal = document.getElementById('tableConstructorModal');
  const content = document.getElementById('tableConstructorContent');
  modal.classList.add('opacity-0');
  content.classList.add('scale-95');
  setTimeout(() => modal.classList.add('hidden'), 300);
}

function saveNewTable() {
  const title = document.getElementById('tableTitle').value.trim() || 'Новая таблица';
  const cols = parseInt(document.getElementById('tableCols').value) || 4;
  const rows = parseInt(document.getElementById('tableRows').value) || 5;

  const emptyData = {};
  for(let i = 0; i < rows; i++) emptyData[i] = Array(cols).fill("");
  
  const colHeaders = Array.from({length: cols}, (_, i) => `Колонка ${i + 1}`);
  const rowHeaders = Array.from({length: rows}, (_, i) => `${i + 1}`);

  const cardId = 'table_' + Date.now();
  const tableCard = {
    id: cardId, title, type: 'table', cols, rows,
    tableData: emptyData, colHeaders, rowHeaders,
    author: currentUser, archived: false, columnId: activeColForMore, order: allCards.length, comments: []
  };

  if (isLocalBoard) {
    const col = columns.find(c => c.id == activeColForMore);
    if (col) { if (!col.cards) col.cards = []; col.cards.push(tableCard); persist(); render(); }
  } else {
    db.collection("boards").doc(BOARD_ID).collection("cards").doc(cardId).set({ ...tableCard, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
    // ЭНТЕРПРАЙЗ: Регистрация создания таблицы
    logActivity(`Создал(а) таблицу данных "${title}"`, 'table');
  }
  closeTableConstructor();
}

function openTableEditor(colId, cardId) {
  const col = columns.find(c => c.id == colId);
  const card = col.cards.find(c => c.id == cardId);
  activeTableData = JSON.parse(JSON.stringify(card)); 
  activeTableData.colId = colId; activeTableData.cardId = cardId;
  
  // Совместимость со старыми таблицами
  if (!activeTableData.colHeaders) activeTableData.colHeaders = Array.from({length: activeTableData.cols}, (_, i) => `Колонка ${i + 1}`);
  if (!activeTableData.rowHeaders) activeTableData.rowHeaders = Array.from({length: activeTableData.rows}, (_, i) => `${i + 1}`);

  document.getElementById('fullTableTitle').innerText = activeTableData.title;
  renderExcelTable();

  const editor = document.getElementById('tableFullEditor');
  editor.classList.remove('hidden');
  setTimeout(() => editor.classList.remove('opacity-0'), 10);
}

function renderExcelTable() {
  const thead = document.getElementById('excelThead');
  const tbody = document.getElementById('excelTbody');
  
  let headHtml = '<tr><th class="p-3 border-r dark:border-gray-700 bg-gray-100 dark:bg-gray-900 w-16 text-center"></th>';
  for (let c = 0; c < activeTableData.cols; c++) {
    headHtml += `<th class="p-0 border-r dark:border-gray-700 bg-gray-100 dark:bg-gray-900 min-w-[140px] group relative">
      <input type="text" value="${activeTableData.colHeaders[c]}" oninput="activeTableData.colHeaders[${c}] = this.value" class="w-full bg-transparent px-3 py-3 outline-none text-[11px] font-black uppercase text-gray-500 tracking-widest text-center focus:text-blue-500 transition-colors" />
      <button onclick="removeTableColumn(${c})" class="absolute top-2 right-2 p-1.5 bg-red-50 text-red-500 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-100"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
    </th>`;
  }
  thead.innerHTML = headHtml + '</tr>';

  let bodyHtml = '';
  for (let r = 0; r < activeTableData.rows; r++) {
    bodyHtml += `<tr class="border-b dark:border-gray-700 hover:bg-blue-50/30 dark:hover:bg-blue-900/10 transition-colors group/row" data-row-idx="${esc(r)}">`;
    bodyHtml += `<td class="p-0 border-r dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30 w-24 relative">
      <div class="flex items-center h-full min-h-[44px]">
         <div class="px-2 cursor-grab row-drag-handle opacity-20 group-hover/row:opacity-100 hover:text-blue-500 transition-all flex items-center h-full"><i data-lucide="grip-vertical" class="w-4 h-4"></i></div>
         <input type="text" value="${activeTableData.rowHeaders[r]}" oninput="activeTableData.rowHeaders[${r}] = this.value" class="w-full bg-transparent outline-none text-[10px] font-bold text-gray-500 text-left focus:text-blue-500 pr-8" />
      </div>
      <button onclick="removeTableRow(${r})" class="absolute top-1/2 -translate-y-1/2 right-1.5 p-1 bg-red-50 text-red-500 rounded-lg opacity-0 group-hover/row:opacity-100 transition-opacity hover:bg-red-100"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
    </td>`;
    
    for (let c = 0; c < activeTableData.cols; c++) {
      const val = activeTableData.tableData[r] && activeTableData.tableData[r][c] ? activeTableData.tableData[r][c] : "";
      bodyHtml += `<td class="p-0 border-r dark:border-gray-700 relative">
        <input type="text" value="${esc(val)}" oninput="updateTableCell(${r}, ${c}, this.value)" class="w-full h-full min-h-[44px] px-3 py-2 bg-transparent outline-none text-sm dark:text-white focus:bg-white dark:focus:bg-gray-700 transition-all border-2 border-transparent focus:border-blue-500" />
      </td>`;
    }
    bodyHtml += `</tr>`;
  }
  tbody.innerHTML = bodyHtml;
  lucide.createIcons();

  if (window.tableRowSortable) window.tableRowSortable.destroy();
  window.tableRowSortable = new Sortable(tbody, {
    handle: '.row-drag-handle', animation: 150,
    onEnd: function(evt) {
       const oldIdx = evt.oldIndex; const newIdx = evt.newIndex;
       const movedRowData = activeTableData.tableData[oldIdx];
       const movedRowHeader = activeTableData.rowHeaders[oldIdx];
       
       const dataArr = [];
       for(let i=0; i<activeTableData.rows; i++) dataArr.push(activeTableData.tableData[i]);
       dataArr.splice(oldIdx, 1); dataArr.splice(newIdx, 0, movedRowData);
       
       activeTableData.rowHeaders.splice(oldIdx, 1);
       activeTableData.rowHeaders.splice(newIdx, 0, movedRowHeader);

       const newTableData = {};
       for(let i=0; i<dataArr.length; i++) newTableData[i] = dataArr[i];
       
       activeTableData.tableData = newTableData;
       renderExcelTable();
    }
  });
}

function addTableColumn() {
   activeTableData.cols++;
   activeTableData.colHeaders.push(`Колонка ${activeTableData.cols}`);
   for(let r=0; r<activeTableData.rows; r++) {
     if(!activeTableData.tableData[r]) activeTableData.tableData[r] = [];
     activeTableData.tableData[r].push("");
   }
   renderExcelTable();
}

function addTableRow() {
   activeTableData.rows++;
   activeTableData.rowHeaders.push(`${activeTableData.rows}`);
   activeTableData.tableData[activeTableData.rows - 1] = Array(activeTableData.cols).fill("");
   renderExcelTable();
}

function removeTableColumn(cIdx) {
   if (activeTableData.cols <= 1) return showSystemToast('Ошибка', 'Минимум 1 колонка.', 'columns-3', 'text-amber-500', 'bg-amber-50');
   activeTableData.cols--;
   activeTableData.colHeaders.splice(cIdx, 1);
   for(let r=0; r<activeTableData.rows; r++) activeTableData.tableData[r].splice(cIdx, 1);
   renderExcelTable();
}

function removeTableRow(rIdx) {
   if (activeTableData.rows <= 1) return showSystemToast('Ошибка', 'Минимум 1 строка.', 'rows-3', 'text-amber-500', 'bg-amber-50');
   activeTableData.rows--;
   activeTableData.rowHeaders.splice(rIdx, 1);
   for(let i = rIdx; i < activeTableData.rows; i++) activeTableData.tableData[i] = activeTableData.tableData[i + 1];
   delete activeTableData.tableData[activeTableData.rows];
   renderExcelTable();
}

function updateTableCell(r, c, val) { activeTableData.tableData[r][c] = val; }
function closeTableEditor() { const editor = document.getElementById('tableFullEditor'); editor.classList.add('opacity-0'); setTimeout(() => { editor.classList.add('hidden'); activeTableData = null; }, 300); }

function commitTableToDb() {
  dispatchCardUpdate(activeTableData.cardId, activeTableData.colId, { 
    cols: activeTableData.cols, rows: activeTableData.rows,
    colHeaders: activeTableData.colHeaders, rowHeaders: activeTableData.rowHeaders,
    tableData: activeTableData.tableData 
  });
  showSystemToast('Сохранено', 'Изменения таблицы успешно записаны.', 'check-circle', 'text-blue-500', 'bg-blue-50');
  closeTableEditor();
}
