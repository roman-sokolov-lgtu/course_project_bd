// Состояние приложения
const appState = {
    currentPage: 1,
    rowsPerPage: 10,
    currentTable: null
};

// Русская локализация для flatpickr
const Russian = {
    weekdays: {
        shorthand: ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"],
        longhand: [
            "Воскресенье",
            "Понедельник",
            "Вторник",
            "Среда",
            "Четверг",
            "Пятница",
            "Суббота"
        ]
    },
    months: {
        shorthand: [
            "Янв",
            "Фев",
            "Мар",
            "Апр",
            "Май",
            "Июн",
            "Июл",
            "Авг",
            "Сен",
            "Окт",
            "Ноя",
            "Дек"
        ],
        longhand: [
            "Январь",
            "Февраль",
            "Март",
            "Апрель",
            "Май",
            "Июнь",
            "Июль",
            "Август",
            "Сентябрь",
            "Октябрь",
            "Ноябрь",
            "Декабрь"
        ]
    },
    firstDayOfWeek: 1,
    ordinal: function() {
        return "";
    },
    rangeSeparator: " — ",
    weekAbbreviation: "Нед.",
    scrollTitle: "Прокрутите для увеличения",
    toggleTitle: "Нажмите для переключения",
    amPM: ["ДП", "ПП"],
    yearAriaLabel: "Год",
    time_24hr: true
};

// Устанавливаем русскую локализацию по умолчанию
if (typeof flatpickr !== 'undefined') {
    flatpickr.localize(Russian);
}

// Обратный маппинг русских и английских названий столбцов
const COLUMN_MAPPING_REVERSE = {
    "ФИО администратора": "administrator_snp",
    "Паспортные данные администратора": "administrator_passport",
    "Почта администратора": "administrator_email",
    "Номер телефона администратора": "administrator_phone",
    "Дата отправления": "departure_date",
    "Скидка": "discount_name",
    "Размер скидки": "discount_amount",
    "Путёвка": "journey_name",
    "Страна": "journey_country",
    "Продолжительность (дней)": "journey_duration",
    "Цена (₽)": "journey_price",
    "ФИО туриста": "tourist_snp",
    "Дата рождения туриста": "tourist_birthday",
    "Номер телефона туриста": "tourist_phone",
    "Почта туриста": "tourist_email",
    "Паспортные данные туриста": "tourist_passport",
    "Дата регистрации": "registration_date",
    "Дата бронирования": "booking_date",
    "Статус бронирования": "booking_status",
    "Дата подтверждения": "confirmation_date",
    "Дата поездки": "trip_date",
    "Итоговая цена (₽)": "final_price",
    "Администратор": "id_administrator",
    "Турист": "id_tourist"
};

// Маппинг имен таблиц с английского на русский
const TABLE_NAME_MAPPING = {
    "administrator": "Администраторы",
    "departure": "Отправления",
    "discount": "Скидки",
    "journey": "Путёвки",
    "tourist": "Туристы",
    "trip": "Поездки"
};

const BOOKING_STATUS_MAPPING = {
    1: "Ожидает",
    2: "Подтверждено",
    3: "Отменено"
};

// Маппинг для связанных полей, которые должны редактироваться через select
const EDITABLE_ID_FIELDS = {
    "journey": {
        "ФИО администратора": "id_administrator"
    },
    "trip": {
        "ФИО администратора": "id_administrator",
        "Путёвка": "id_journey",
        "ФИО туриста": "id_tourist",
        "Скидка": "id_discount",
        "Статус бронирования": "booking_status"
    },
    "tourist": {
        "Скидка": "id_discount"
    }
};

// Вспомогательная функция для поиска id по имени (или id)
function getSelectedIdByName(options, name) {
    if (!name) return '';
    // Сначала ищем по имени
    let found = options.find(opt => opt.name === name || String(opt.name) === String(name));
    if (found) return found.id;
    // Если не найдено — ищем по id (на случай если вдруг в ячейке id)
    found = options.find(opt => String(opt.id) === String(name));
    return found ? found.id : '';
}

function getStatusClass(statusId) {
    switch (statusId) {
        case 1: return 'status-pending';
        case 2: return 'status-confirmed';
        case 3: return 'status-cancelled';
        default: return '';
    }
}

function formatDate(dateString) {
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0'); // Январь начинается с 0
    const year = date.getFullYear();
    return `${day}.${month}.${year}`; // Форматируем как ДД-ММ-ГГГГ
}

async function fetchTables() {
    try {
        const response = await fetch('/tables');
        const data = await response.json();

        if (data.error) {
            console.error(data.error);
            return;
        }

        const tableSelect = document.getElementById('table-select');
        data.tables.forEach(table => {
            const option = document.createElement('option');
            option.value = table;
            // Используем маппинг для отображения названия таблицы на русском
            option.textContent = TABLE_NAME_MAPPING[table] || table;  // Если не найдено маппинга, показываем оригинальное имя
            tableSelect.appendChild(option);
        });
    } catch (error) {
        console.error('Error fetching tables:', error);
    }
}

async function fetchTableData(tableName, sortColumn = null, sortDirection = 'asc') {
    try {
        const url = new URL(`/table/${tableName}`, window.location.origin);
        if (sortColumn) {
            url.searchParams.append('sort_column', sortColumn);
            url.searchParams.append('sort_direction', sortDirection);
        }

        const response = await fetch(url);
        const data = await response.json();

        if (data.error) {
            console.error(data.error);
            return;
        }

        const tableHeaders = document.getElementById('table-headers');
        const tableRows = document.getElementById('table-rows');

        tableHeaders.innerHTML = '';
        tableRows.innerHTML = '';

        // Убираем ID из видимых столбцов
        let columns = data.columns.slice(1);

        // Переупорядочиваем столбцы если нужно
        if (tableName === "trip" || tableName === "journey") {
            const adminIndex = columns.indexOf('ФИО администратора');
            if (adminIndex !== -1) {
                const [adminColumn] = columns.splice(adminIndex, 1);
                columns.push(adminColumn);
            }
            const touristIndex = columns.indexOf('ФИО туриста');
            if (touristIndex !== -1) {
                const [touristColumn] = columns.splice(touristIndex, 1);
                columns.splice(0, 0, touristColumn);
            }
        } else if (tableName === "administrator") {
            const adminIndex = columns.indexOf('ФИО администратора');
            if (adminIndex !== -1) {
                const [adminColumn] = columns.splice(adminIndex, 1);
                columns.splice(0, 0, adminColumn);
            }
        }
        
        // Добавляем заголовки
        columns.forEach((column) => {
            const th = document.createElement('th');
            th.textContent = column;
            th.style.backgroundColor = '#f8f9fa'; // Светло-серый фон для заголовков
            th.style.padding = '16px'; // Отступы для заголовков
            th.style.borderBottom = '2px solid #dee2e6'; // Более заметная нижняя граница
            th.style.fontWeight = '600'; // Чуть более жирный шрифт
            th.style.textAlign = 'left'; // Выравнивание текста по левому краю
            tableHeaders.appendChild(th);
        });

        // Добавляем строки
        data.rows.forEach((row) => {
            const tr = document.createElement('tr');
            tr.dataset.id = row[0]; // Сохраняем ID как data-атрибут
            tr.classList.add('table-row'); // Добавляем базовый класс для строки

            // Пропускаем первый столбец (ID) и используем остальные данные
            const rowData = row.slice(1);

            // Переупорядочиваем данные в строке в соответствии с порядком столбцов
            const reorderedRow = columns.map((columnName) => {
                const originalIndex = data.columns.indexOf(columnName);
                return row[originalIndex];
            });

            reorderedRow.forEach((cell, index) => {
                const td = document.createElement('td');
                td.classList.add('table-cell'); // Добавляем класс для ячейки
                const columnName = columns[index];

                if (COLUMN_MAPPING_REVERSE[columnName] === "booking_status") {
                    const statusText = BOOKING_STATUS_MAPPING[cell];
                    const statusClass = getStatusClass(cell);
                    td.innerHTML = `<span class="status-badge ${statusClass}">${statusText}</span>`;
                } else if (typeof cell === "string" && cell.includes("GMT")) {
                    const date = new Date(cell);
                    const day = String(date.getDate()).padStart(2, '0');
                    const month = String(date.getMonth() + 1).padStart(2, '0');
                    const year = date.getFullYear();
                    td.textContent = `${day}.${month}.${year}`;
                } else {
                    td.textContent = cell !== null ? cell : 'N/A';
                }

                tr.appendChild(td);
            });

            tableRows.appendChild(tr);
        });

        // Добавляем стили для таблицы
        const style = document.createElement('style');
        style.textContent = `
            .table-row {
                background-color: #ffffff;
                height: 50px;
                border-bottom: 1px solid #e0e0e0;
                transition: background-color 0.2s ease;
            }
            
            .table-row:hover:not(.selected) {
                background-color: #f5f5f5;
            }
            
            .table-row.selected {
                background-color: #e3f2fd !important;
            }
            
            .table-cell {
                padding: 12px 16px;
            }
            
            #table-headers th {
                background-color: #f8f9fa;
                padding: 16px;
                border-bottom: 2px solid #dee2e6;
                font-weight: 600;
                text-align: left;
            }
        `;
        document.head.appendChild(style);

        // Обновляем обработчик клика для выделения строк
        const tableBody = document.getElementById('table-rows');
        if (tableBody) {
            tableBody.addEventListener('click', (event) => {
                const row = event.target.closest('tr');
                if (!row) return;
                
                // Снимаем выделение со всех строк
                document.querySelectorAll('#table-rows tr').forEach(tr => {
                    tr.classList.remove('selected');
                });
                
                // Выделяем текущую строку
                row.classList.add('selected');
            });
        }

        paginateTable();

        // После рендера таблицы добавить обработчик dblclick
        const rows = document.querySelectorAll('#table-rows tr');
        rows.forEach(row => {
            const rowId = row.dataset.id;
            const tableName = appState.currentTable || (document.getElementById('table-select')?.value);
            row.querySelectorAll('td').forEach((cell, idx) => {
                // Не даём редактировать только кнопки отмены для туриста
                if (cell.querySelector('.cancel-booking-btn')) return;
                cell.ondblclick = function() {
                    const ths = document.querySelectorAll('#table-headers th');
                    const columnName = ths[idx]?.textContent?.trim();
                    if (!columnName) return;
                    makeCellEditable(cell, tableName, rowId, columnName);
                };
            });
        });
    } catch (error) {
        console.error('Error fetching table data:', error);
    }
}

// Функция для пагинации таблицы
function paginateTable() {
    const tableRows = document.querySelectorAll('#table-rows tr');
    const totalRows = tableRows.length;
    const totalPages = Math.ceil(totalRows / appState.rowsPerPage);
    
    // Скрываем все строки
    tableRows.forEach(row => row.style.display = 'none');
    
    // Показываем только строки для текущей страницы
    const start = (appState.currentPage - 1) * appState.rowsPerPage;
    const end = start + appState.rowsPerPage;
    
    for (let i = start; i < end && i < totalRows; i++) {
        tableRows[i].style.display = '';
    }
    
    // Обновляем элементы пагинации
    const pagination = document.querySelector('.pagination');
    if (!pagination) return;
    
    pagination.innerHTML = '';
    
    // Кнопка "Предыдущая"
    const prevButton = document.createElement('button');
    prevButton.textContent = '←';
    prevButton.disabled = appState.currentPage === 1;
    prevButton.onclick = () => {
        if (appState.currentPage > 1) {
            appState.currentPage--;
            paginateTable();
        }
    };
    pagination.appendChild(prevButton);
    
    // Номер текущей страницы
    const pageInfo = document.createElement('span');
    pageInfo.textContent = ` Страница ${appState.currentPage} из ${totalPages} `;
    pageInfo.style.margin = '0 10px';
    pagination.appendChild(pageInfo);
    
    // Кнопка "Следующая"
    const nextButton = document.createElement('button');
    nextButton.textContent = '→';
    nextButton.disabled = appState.currentPage === totalPages;
    nextButton.onclick = () => {
        if (appState.currentPage < totalPages) {
            appState.currentPage++;
            paginateTable();
        }
    };
    pagination.appendChild(nextButton);
    
    // Показываем пагинацию только если есть больше одной страницы
    pagination.style.display = totalPages > 1 ? 'flex' : 'none';
}

document.addEventListener('DOMContentLoaded', function() {
    // Проверяем роль пользователя при загрузке страницы
    const tableSelect = document.getElementById('table-select');
    const tableSelectContainer = document.querySelector('.table-select-container');

    // Получаем роль пользователя с сервера
    fetch('/get_user_role')
        .then(response => response.json())
        .then(data => {
            if (data.role === 'tourist') {
                // Для туриста скрываем выбор таблицы и показываем только его поездки
                if (tableSelectContainer) {
                    tableSelectContainer.style.display = 'none';
                }
                // Автоматически загружаем таблицу поездок
                fetchTableData('trip');
                  } else {
                // Для администратора оставляем все как есть
                if (tableSelectContainer) {
                    tableSelectContainer.style.display = 'block';
                }
                // Загружаем список таблиц для администратора
                fetchTables();
            }
        })
        .catch(error => {
            console.error('Error fetching user role:', error);
        });

    // Инициализация пагинации
    const paginationContainer = document.querySelector(".pagination");
    if (paginationContainer) {
        paginationContainer.style.display = 'none';
    }

    // Обработчики для кнопок меню
    const closeMenuButton = document.getElementById("close-menu");
    if (closeMenuButton) {
        closeMenuButton.addEventListener("click", () => {
            const sideMenu = document.getElementById("side-menu");
            if (sideMenu) {
                sideMenu.classList.remove("active");
            }
        });
    }

    // Обработчик изменения выбранной таблицы
    if (tableSelect) {
        tableSelect.addEventListener('change', event => {
            const selectedTable = event.target.value;
            if (selectedTable) {
                fetchTableData(selectedTable);
                appState.currentTable = selectedTable;

                const pagination = document.querySelector('.pagination');
                if (pagination) {
                    pagination.style.display = 'flex';
                }
            }

            const bookTripButton = document.getElementById('book-trip-button');
            const reportButton = document.getElementById('report-button');
            
            if (bookTripButton) {
                bookTripButton.style.display = event.target.value === 'trip' ? 'block' : 'none';
            }
            if (reportButton) {
                reportButton.style.display = event.target.value === 'trip' ? 'block' : 'none';
            }
        });
    }

    // Обработчик для поиска
    const searchInput = document.getElementById('search');
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            const searchTerm = this.value.toLowerCase();
            const tableRows = document.querySelectorAll('#table-rows tr');
            tableRows.forEach(row => {
                const cells = Array.from(row.children);
                const matches = cells.some(cell => cell.textContent.toLowerCase().includes(searchTerm));
                row.style.display = matches ? '' : 'none';
            });
        });
    }

    // Обработчик для кнопки отмены выделения строки
    const undoButton = document.getElementById('undo-button');
    if (undoButton) {
        undoButton.addEventListener('click', () => {
            document.querySelectorAll('#table-rows tr.selected').forEach(tr => {
                tr.classList.remove('selected');
            });
        });
    }

    // Обработчики для модального окна бронирования
    const bookTripButton = document.getElementById('book-trip-button');
    const bookTripModal = document.getElementById('book-trip-modal');
    const closeBookModal = document.getElementById('close-modal');
    const bookTripForm = document.getElementById('book-trip-form');

    if (bookTripButton && bookTripModal) {
        bookTripButton.addEventListener('click', async () => {
            bookTripModal.style.display = 'block';
            // Загружаем список путевок
            try {
                const response = await fetch('/table/journey');
                const data = await response.json();
                const journeySelect = document.getElementById('journey');
                if (journeySelect) {
                    journeySelect.innerHTML = '';
                    data.rows.forEach(row => {
                        const option = document.createElement('option');
                        option.value = row[0]; // id_journey
                        option.textContent = `${row[2]} - ${row[3]} (${row[4]} дней, ${row[5]}₽)`; // name, country, duration, price
                        journeySelect.appendChild(option);
                    });
                    }
                } catch (error) {
                console.error('Error loading journeys:', error);
                alert('Ошибка при загрузке списка путевок');
            }
        });
    }

    if (closeBookModal && bookTripModal) {
        closeBookModal.addEventListener('click', () => {
            bookTripModal.style.display = 'none';
        });
    }

    if (bookTripForm) {
        bookTripForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const journeyId = document.getElementById('journey')?.value;
            if (!journeyId) {
                alert('Выберите путевку');
                return;
            }

            try {
                const response = await fetch('/call_book_trip', {
                    method: 'POST',
                        headers: {
                        'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                        journey_id: journeyId
                    })
                });
                
                const data = await response.json();
                
                if (response.ok) {
                    alert('Поездка успешно забронирована!');
                    bookTripModal.style.display = 'none';
                    if (appState.currentTable === 'trip') {
                        fetchTableData('trip');
                    }
                    } else {
                    alert(data.error || 'Ошибка при бронировании поездки');
                    }
                } catch (error) {
                console.error('Error booking trip:', error);
                alert('Произошла ошибка при бронировании. Пожалуйста, попробуйте позже.');
            }
        });
    }

    // Обработчики для отчетов
    const reportButton = document.getElementById('report-button');
    const reportModal = document.getElementById('report-modal');
    const closeReportModal = document.getElementById('close-report-modal');
    const reportForm = document.getElementById('report-form');
    const savePdfButton = document.getElementById('save-pdf-button');

    if (reportButton && reportModal) {
        reportButton.addEventListener('click', function() {
            reportModal.style.display = 'block';
            if (typeof flatpickr !== 'undefined') {
                flatpickr("#start-date", { 
                    dateFormat: "d.m.Y",
                    allowInput: true
                });
                flatpickr("#end-date", { 
                    dateFormat: "d.m.Y",
                    allowInput: true
                });
            }
        });
    }

    if (closeReportModal && reportModal) {
        closeReportModal.addEventListener('click', function() {
            reportModal.style.display = 'none';
        });
    }

    if (reportForm) {
        reportForm.addEventListener('submit', async function(event) {
            event.preventDefault();
            const startDate = document.getElementById('start-date')?.value;
            const endDate = document.getElementById('end-date')?.value;

            if (!startDate || !endDate) {
                alert('Пожалуйста, выберите даты');
                        return;
                    }
    
                    try {
                const response = await fetch('/generate_report', {
                    method: 'POST',
                        headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ start_date: startDate, end_date: endDate })
                });
                    const result = await response.json();
                    if (result.success) {
                    alert(`Количество путёвок: ${result.count}, Общая сумма: ${result.total_price} ₽`);
                    if (savePdfButton) {
                        savePdfButton.style.display = 'block';
                    }
                    } else {
                    alert('Ошибка при генерации отчёта: ' + result.error);
                    }
                } catch (error) {
                console.error('Error generating report:', error);
                alert('Ошибка при генерации отчёта');
            }
        });
    }

    if (savePdfButton) {
        savePdfButton.addEventListener('click', function() {
            if (!window.jspdf) {
                alert('Ошибка: библиотека jsPDF не загружена');
                return;
            }

            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();

            // Заголовки столбцов для PDF
            const headers = ['Putevka', 'Skidka', 'Data', 'Vyruchka'];
            
            const startDate = document.getElementById('start-date')?.value;
            const endDate = document.getElementById('end-date')?.value;
            if (!startDate || !endDate) {
                alert('Пожалуйста, выберите даты');
                return;
            }
    
            const start = new Date(startDate.split('.').reverse().join('-'));
            const end = new Date(endDate.split('.').reverse().join('-'));

            // Получаем заголовки таблицы и определяем индексы нужных столбцов
            const ths = Array.from(document.querySelectorAll('#table-headers th'));
            const headerNames = ths.map(th => th.textContent.trim());
            const idxStatus = headerNames.indexOf('Статус бронирования');
            const idxConfirmation = headerNames.indexOf('Дата подтверждения');
            const idxJourney = headerNames.indexOf('Путёвка');
            const idxDiscount = headerNames.indexOf('Скидка');
            const idxFinalPrice = headerNames.indexOf('Итоговая цена (₽)');

            // Массив для данных
            const tableData = [];
            let totalPrice = 0;
            let totalTrips = 0;

            // Получаем строки таблицы и извлекаем необходимые данные
            const rows = document.querySelectorAll("#table-rows tr");
            rows.forEach(row => {
                const columns = row.querySelectorAll("td");
                const bookingStatus = idxStatus !== -1 ? columns[idxStatus]?.textContent || "" : "";
                if (bookingStatus.trim() === "Подтверждено") {
                    const confirmationDateText = idxConfirmation !== -1 ? columns[idxConfirmation]?.textContent || "" : "";
                    const confirmationDate = new Date(confirmationDateText.split('.').reverse().join('-'));
                    if (confirmationDate >= start && confirmationDate <= end) {
                        const journeyName = idxJourney !== -1 ? columns[idxJourney]?.textContent || "" : "";
                        const discountName = idxDiscount !== -1 ? columns[idxDiscount]?.textContent || "" : "";
                        const finalPrice = idxFinalPrice !== -1 ? parseFloat(columns[idxFinalPrice]?.textContent || "0") : 0;
                        tableData.push([
                            transliterate(journeyName),
                            transliterate(discountName),
                            confirmationDateText,
                            finalPrice.toFixed(2)
                        ]);
                        totalPrice += finalPrice;
                        totalTrips++;
                }
            }
        });

            doc.autoTable({
                head: [headers],
                body: tableData,
            });
            
            const finalText = `Overall: ${totalPrice.toFixed(2)} rubles for ${totalTrips} trips from ${startDate} to ${endDate}                         © Easy Travel`;
            doc.setFontSize(12);
            const pageHeight = doc.internal.pageSize.height;
            doc.text(finalText, 14, pageHeight - 10);

            doc.save('report.pdf');
        });
    }

    // Обработчик для закрытия модальных окон при клике вне их области
    window.addEventListener('click', (event) => {
        if (bookTripModal && event.target === bookTripModal) {
            bookTripModal.style.display = 'none';
        }
        if (reportModal && event.target === reportModal) {
            reportModal.style.display = 'none';
        }
    });

    // Обработчик для кнопки редактирования
    const editButton = document.getElementById('edit-button');
    if (editButton) {
        editButton.addEventListener('click', () => {
            const selectedRow = document.querySelector('#table-rows tr.selected');
    if (!selectedRow) {
                alert('Пожалуйста, выберите строку для редактирования');
        return;
    }
            const tableName = document.getElementById('table-select')?.value;
            if (!tableName) {
                alert('Пожалуйста, выберите таблицу');
                return;
            }
            openSideMenu(tableName, selectedRow.dataset.id);
        });
    }

    // Обработчик для кнопки отмены в боковом меню
    const cancelButton = document.getElementById('cancel-changes');
    if (cancelButton) {
        cancelButton.addEventListener('click', () => {
            const sideMenu = document.getElementById('side-menu');
            if (sideMenu) {
                sideMenu.classList.remove('active');
            }
        });
    }

    // Обработчик для закрытия бокового меню
    const closeSideMenu = document.querySelector('.close-side-menu');
    if (closeSideMenu) {
        closeSideMenu.addEventListener('click', () => {
            const sideMenu = document.getElementById('side-menu');
            if (sideMenu) {
                sideMenu.classList.remove('active');
            }
        });
    }

    // Обработчик для кнопки добавления путевки
    const addJourneyButton = document.getElementById('add-journey-button');
    const addJourneyModal = document.getElementById('add-journey-modal');
    const closeAddJourneyModal = document.getElementById('close-add-journey-modal');
    const addJourneyForm = document.getElementById('add-journey-form');

    if (addJourneyButton && addJourneyModal) {
        addJourneyButton.addEventListener('click', () => {
            addJourneyModal.style.display = 'block';
        });
    }

    if (closeAddJourneyModal) {
        closeAddJourneyModal.addEventListener('click', () => {
            addJourneyModal.style.display = 'none';
        });
    }

    if (addJourneyForm) {
        addJourneyForm.addEventListener('submit', async (event) => {
    event.preventDefault();
            
            const formData = {
                journey_name: document.getElementById('journey-name').value,
                journey_country: document.getElementById('journey-country').value,
                journey_duration: document.getElementById('journey-duration').value,
                journey_price: document.getElementById('journey-price').value
            };

            try {
                const response = await fetch('/add_journey', {
            method: 'POST',
                            headers: {
                        'Content-Type': 'application/json'
            },
                    body: JSON.stringify(formData)
                        });
    
                        const result = await response.json();
                        if (result.success) {
                    alert('Путевка успешно добавлена');
                    addJourneyModal.style.display = 'none';
                    addJourneyForm.reset();
                    if (appState.currentTable === 'journey') {
                        fetchTableData('journey');
                    }
                        } else {
                    alert(result.error || 'Ошибка при добавлении путевки');
                        }
                    } catch (error) {
                console.error('Error adding journey:', error);
                alert('Произошла ошибка при добавлении путевки');
            }
        });
    }

    // Закрытие модального окна при клике вне его области
    window.addEventListener('click', (event) => {
        if (event.target === addJourneyModal) {
            addJourneyModal.style.display = 'none';
        }
    });

    // Добавляем обработчик для кнопки 'add-departure-button'
    const addDepartureButton = document.getElementById('add-departure-button');
    function setupAddDepartureModal() {
        let addDepartureModal = document.getElementById('add-departure-modal');
        if (!addDepartureModal) {
            addDepartureModal = document.createElement('div');
            addDepartureModal.id = 'add-departure-modal';
            addDepartureModal.className = 'modal';
            addDepartureModal.innerHTML = `
                <div class="modal-content">
                    <span class="close" id="close-add-departure-modal">&times;</span>
                    <h3>Добавить дату отправления</h3>
                    <form id="add-departure-form">
                        <div class="form-group">
                            <label for="departure-journey">Путевка</label>
                            <select id="departure-journey" required></select>
                        </div>
                        <div class="form-group">
                            <label for="departure-date">Дата отправления</label>
                            <input type="date" id="departure-date" required>
                        </div>
                        <button type="submit" class="save-button">Добавить дату</button>
                    </form>
                </div>
            `;
            document.body.appendChild(addDepartureModal);
        }
        addDepartureButton.onclick = async () => {
            addDepartureModal.style.display = 'block';
            // Загрузить список путевок
    try {
        const response = await fetch('/table/journey');
        const data = await response.json();
                const journeySelect = document.getElementById('departure-journey');
                if (journeySelect) {
                    journeySelect.innerHTML = '';
                    data.rows.forEach(row => {
                        const option = document.createElement('option');
                        option.value = row[0];
                        option.textContent = `${row[2]} - ${row[3]} (${row[4]} дней, ${row[5]}₽)`;
                        journeySelect.appendChild(option);
                    });
                }
    } catch (error) {
                alert('Ошибка при загрузке списка путевок');
            }
        };
        document.getElementById('close-add-departure-modal').onclick = () => {
            addDepartureModal.style.display = 'none';
        };
        document.getElementById('add-departure-form').onsubmit = async (event) => {
            event.preventDefault();
            const journeyId = document.getElementById('departure-journey').value;
            const departureDate = document.getElementById('departure-date').value;
            if (!journeyId || !departureDate) {
                alert('Заполните все поля');
        return;
    }
            try {
                const response = await fetch('/add_departure', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id_journey: journeyId, departure_date: departureDate })
                });
                        const result = await response.json();
                        if (result.success) {
                    alert('Дата отправления успешно добавлена');
                    addDepartureModal.style.display = 'none';
                    if (appState.currentTable === 'departure') fetchTableData('departure');
                        } else {
                    alert(result.error || 'Ошибка при добавлении даты отправления');
                        }
    } catch (error) {
                alert('Произошла ошибка при добавлении даты отправления');
            }
        };
        window.addEventListener('click', (event) => {
            if (event.target === addDepartureModal) {
                addDepartureModal.style.display = 'none';
            }
        });
    }
    if (addDepartureButton) {
        addDepartureButton.style.display = (appState.currentTable === 'departure') ? 'inline-block' : 'none';
        if (appState.currentTable === 'departure') setupAddDepartureModal();
        if (tableSelect) {
            tableSelect.addEventListener('change', event => {
                addDepartureButton.style.display = (event.target.value === 'departure') ? 'inline-block' : 'none';
                if (event.target.value === 'departure') setupAddDepartureModal();
            });
        }
    }
});

// Вспомогательная функция для транслитерации
    function transliterate(text) {
        const mapping = {
            "а": "a", "б": "b", "в": "v", "г": "g", "д": "d",
            "е": "e", "ё": "e", "ж": "zh", "з": "z", "и": "i",
            "й": "y", "к": "k", "л": "l", "м": "m", "н": "n",
            "о": "o", "п": "p", "р": "r", "с": "s", "т": "t",
            "у": "u", "ф": "f", "х": "kh", "ц": "ts", "ч": "ch",
            "ш": "sh", "щ": "shch", "ы": "y", "э": "e", "ю": "yu",
            "я": "ya", "ь": "", "ъ": "",
            "А": "A", "Б": "B", "В": "V", "Г": "G", "Д": "D",
            "Е": "E", "Ё": "E", "Ж": "Zh", "З": "Z", "И": "I",
            "Й": "Y", "К": "K", "Л": "L", "М": "M", "Н": "N",
            "О": "O", "П": "P", "Р": "R", "С": "S", "Т": "T",
            "У": "U", "Ф": "F", "Х": "Kh", "Ц": "Ts", "Ч": "Ch",
            "Ш": "Sh", "Щ": "Shch", "Ы": "Y", "Э": "E", "Ю": "Yu",
            "Я": "Ya", "Ь": "", "Ъ": ""
        };
        return text.split('').map(char => mapping[char] || char).join('');
    }

// Функция для открытия бокового меню редактирования
async function openSideMenu(tableName, rowId) {
    const sideMenu = document.getElementById('side-menu');
    const editForm = document.getElementById('edit-form');
    
    if (!sideMenu || !editForm) return;

    try {
        // Получаем данные строки
        const response = await fetch(`/get_row/${tableName}/${rowId}`);
        const data = await response.json();

        if (data.error) {
            alert(data.error);
        return;
    }

        // Очищаем форму
        editForm.innerHTML = '';

        // Определяем порядок полей в зависимости от таблицы
        let fieldOrder;
        if (tableName === 'departure') {
            fieldOrder = [
                'departure_date',      // Дата отправления
                'id_journey'           // Путёвка
            ];
        } else if (tableName === 'trip') {
            fieldOrder = [
                'id_journey',          // Путёвка
                'trip_date',           // Дата поездки
                'id_tourist',          // Турист
                'booking_date',        // Дата бронирования
                'booking_status',      // Статус бронирования
                'confirmation_date',   // Дата подтверждения
                'final_price',         // Итоговая цена
                'id_administrator',    // Администратор
                'id_discount'          // Скидка
            ];
        } else if (tableName === 'discount') {
            fieldOrder = [
                'discount_name',       // Название скидки
                'discount_amount'      // Размер скидки
            ];
        } else if (tableName === 'tourist') {
            fieldOrder = [
                'tourist_snp',         // ФИО туриста
                'tourist_birthday',    // Дата рождения
                'tourist_phone',       // Телефон
                'tourist_email',       // Email
                'tourist_passport',    // Паспорт
                'id_discount'          // Скидка
            ];
        } else if (tableName === 'journey') {
            fieldOrder = [
                'journey_name',        // Название путевки
                'journey_country',     // Страна
                'journey_duration',    // Продолжительность
                'journey_price',       // Цена
                'id_administrator'     // Администратор
            ];
        } else {
            // Для остальных таблиц берем все поля из data.row
            fieldOrder = Object.keys(data.row);
        }

        // Создаем поля в нужном порядке
        fieldOrder.forEach(fieldName => {
            if (!(fieldName in data.row)) return;

            const value = data.row[fieldName];
            const formGroup = document.createElement('div');
            formGroup.className = 'input-group';

            const label = document.createElement('label');
            // Определяем русское название поля
            let displayName;
            if (fieldName === 'id_discount') {
                displayName = 'Скидка';
            } else if (fieldName === 'id_administrator') {
                displayName = 'Администратор';
            } else if (fieldName === 'id_tourist') {
                displayName = 'Турист';
            } else if (fieldName === 'id_journey') {
                displayName = 'Путёвка';
            } else if (fieldName === 'booking_date') {
                displayName = 'Дата бронирования';
            } else if (fieldName === 'booking_status') {
                displayName = 'Статус бронирования';
            } else if (fieldName === 'confirmation_date') {
                displayName = 'Дата подтверждения';
            } else if (fieldName === 'trip_date') {
                displayName = 'Дата поездки';
            } else if (fieldName === 'departure_date') {
                displayName = 'Дата отправления';
            } else if (fieldName === 'final_price') {
                displayName = 'Итоговая цена (₽)';
            } else if (fieldName === 'discount_name') {
                displayName = 'Название скидки';
            } else if (fieldName === 'discount_amount') {
                displayName = 'Размер скидки (%)';
            } else if (fieldName === 'tourist_snp') {
                displayName = 'ФИО туриста';
            } else if (fieldName === 'tourist_birthday') {
                displayName = 'Дата рождения';
            } else if (fieldName === 'tourist_phone') {
                displayName = 'Телефон';
            } else if (fieldName === 'tourist_email') {
                displayName = 'Email';
            } else if (fieldName === 'tourist_passport') {
                displayName = 'Паспортные данные';
            } else if (fieldName === 'journey_name') {
                displayName = 'Название путевки';
            } else if (fieldName === 'journey_country') {
                displayName = 'Страна';
            } else if (fieldName === 'journey_duration') {
                displayName = 'Продолжительность (дней)';
            } else if (fieldName === 'journey_price') {
                displayName = 'Цена (₽)';
            } else if (fieldName === 'administrator_email') {
                displayName = 'Email';
            } else if (fieldName === 'administrator_passport') {
                displayName = 'Паспортные данные';
            } else if (fieldName === 'administrator_phone') {
                displayName = 'Телефон';
            } else if (fieldName === 'administrator_snp') {
                displayName = 'ФИО';
            } else {
                displayName = fieldName;
            }
            
            label.textContent = displayName;
            formGroup.appendChild(label);

            // Создаем соответствующий элемент ввода
            let input;
            const relatedData = data.related_data || {};

            if (fieldName === 'id_journey' && relatedData.journeys) {
                input = createSelect(relatedData.journeys, value);
            } else if (fieldName === 'id_tourist' && relatedData.tourists) {
                input = createSelect(relatedData.tourists, value);
            } else if (fieldName === 'id_discount' && relatedData.discounts) {
                input = createSelect(relatedData.discounts, value);
            } else if (fieldName === 'id_administrator' && relatedData.administrators) {
                // Исключаем владельца (id == 0 или name == '0') из выпадающего списка
                const filteredAdmins = relatedData.administrators.filter(admin => String(admin.id) !== '0' && admin.name !== '0');
                input = createSelect(filteredAdmins, getSelectedIdByName(filteredAdmins, value));
            } else if (fieldName === 'booking_status' && relatedData.statuses) {
                input = createSelect(relatedData.statuses, value);
            } else if (fieldName.includes('date') || fieldName.includes('birthday')) {
                input = document.createElement('input');
                input.type = 'text';
                input.className = 'date-input';
                input.readOnly = true;
                input.value = value ? formatDate(value) : '';
                input.name = fieldName;
                input.dataset.originalName = fieldName;
                formGroup.appendChild(input);

                // Инициализация календаря после добавления input в DOM
                const fp = flatpickr(input, {
                    dateFormat: 'd.m.Y',
                    allowInput: false,
                    locale: Russian,
                    disableMobile: true,
                    static: true,
                    monthSelectorType: 'static',
                    time_24hr: true,
                    defaultDate: value || null,
                    onChange: function(selectedDates, dateStr) {
                        // Преобразуем дату в формат YYYY-MM-DD для SQL
                        const dateParts = dateStr.split('.');
                        const sqlDate = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`;
                        
                        const formData = {
                            column: input.dataset.originalName,
                            value: sqlDate,
                            display_value: false
                        };

                        fetch(`/update_cell/${tableName}/${rowId}`, {
                            method: 'POST',
                headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify(formData)
            })
                .then(response => response.json())
                .then(result => {
                    if (!result.success) {
                                throw new Error(result.error || 'Ошибка при обновлении даты');
                            }
                            input.value = dateStr; // Оставляем отображение в формате DD.MM.YYYY
                            // Обновляем таблицу после успешного обновления
                            fetchTableData(tableName);
                        })
                        .catch(error => {
                            console.error('Error updating date:', error);
                            alert(error.message);
                            input.value = value ? formatDate(value) : '';
                        });
                    }
                });
            } else if (fieldName === 'discount_amount' || fieldName === 'journey_duration' || fieldName === 'journey_price' || fieldName === 'final_price') {
                input = document.createElement('input');
                input.type = 'number';
                input.min = '0';
                if (fieldName === 'discount_amount') {
                    input.max = '100';
                }
                input.value = value || '';
            } else if (fieldName === 'tourist_phone' || fieldName === 'administrator_phone') {
                input = document.createElement('input');
                input.type = 'text';
                input.maxLength = 12;
                input.pattern = '\\+7\\d{10}';
                input.title = 'Телефон должен быть в формате +7XXXXXXXXXX';
                input.value = value || '';
                input.name = fieldName;
                input.addEventListener('input', function(e) {
                    let v = input.value.replace(/[^\d+]/g, '');
                    if (!v.startsWith('+7')) v = '+7' + v.replace(/^\+?7?/, '');
                    v = v.slice(0, 12);
                    input.value = v;
                });
                formGroup.appendChild(input);
            } else {
                input = document.createElement('input');
                input.type = 'text';
                input.value = value || '';
            }

            input.name = fieldName;
            formGroup.appendChild(input);
            editForm.appendChild(formGroup);
        });

        // Добавляем обработчик для сохранения изменений
        const saveButton = document.getElementById('save-changes');
        if (saveButton) {
            saveButton.onclick = async (e) => {
                e.preventDefault();
                
                const formData = {};
                const inputs = editForm.querySelectorAll('input, select');
                let hasChanges = false;

                inputs.forEach(input => {
                    if (!input.name || input.name.trim() === '') {
                        return; // Пропускаем поля без имени
                    }
                    
                    const newValue = input.value.trim();
                    const originalValue = data.row[input.name];
                    
                    // Преобразуем значения для корректного сравнения
                    let formattedOriginalValue = originalValue;
                    if (originalValue !== null && originalValue !== undefined) {
                        if (input.type === 'number') {
                            formattedOriginalValue = originalValue.toString();
                        } else if (input.classList.contains('date-input')) {
                            formattedOriginalValue = originalValue;
                        } else {
                            formattedOriginalValue = originalValue.toString().trim();
                        }
                    } else {
                        formattedOriginalValue = '';
                    }

                    // Проверяем, изменилось ли значение
                    if (newValue !== formattedOriginalValue) {
                        hasChanges = true;
                        // Для числовых полей преобразуем строку в число
                        if (input.type === 'number') {
                            formData[input.name] = parseFloat(newValue) || 0;
                        } else {
                            formData[input.name] = newValue || null;
                        }
                    }
                });

                if (!hasChanges) {
                    sideMenu.classList.remove('active');
                    return;
                }

                console.log('Form data before sending:', formData); // Отладочный вывод

                try {
                    console.log('Sending update with data:', formData); // Отладочный вывод
                    const response = await fetch(`/update_row/${tableName}/${rowId}`, {
            method: 'POST',
            headers: {
                            'Content-Type': 'application/json'
            },
                        body: JSON.stringify(formData)
        });

        const result = await response.json();
                    console.log('Server response:', result); // Отладочный вывод

                    if (!response.ok) {
                        throw new Error(result.error || `HTTP error! status: ${response.status}`);
                    }

        if (result.success) {
                        alert('Изменения сохранены успешно');
                        sideMenu.classList.remove('active');
                        fetchTableData(tableName);
        } else {
                        throw new Error(result.error || 'Ошибка при сохранении изменений');
        }
    } catch (error) {
                    console.error('Error updating row:', error);
                    let errorMessage = 'Произошла ошибка при сохранении изменений';
                    
                    if (error.message) {
                        if (error.message.includes('duplicate key')) {
                            errorMessage = 'Запись с такими данными уже существует';
                        } else if (error.message.includes('foreign key')) {
                            errorMessage = 'Невозможно обновить запись: нарушение связей между таблицами';
                        } else {
                            errorMessage = error.message;
                        }
                    }
                    
                    alert(errorMessage);
                }
            };
        }

        // Показываем боковое меню
        sideMenu.classList.add('active');
    } catch (error) {
        console.error('Error opening side menu:', error);
        alert('Произошла ошибка при загрузке данных');
    }
}

// Вспомогательная функция для создания выпадающего списка
function createSelect(options, selectedValue) {
    const select = document.createElement('select');
    select.classList.add('form-control');
    
    // Добавляем пустой вариант
    const emptyOption = document.createElement('option');
    emptyOption.value = '';
    emptyOption.textContent = '-- Выберите --';
    select.appendChild(emptyOption);
    
    // Добавляем варианты
    options.forEach(option => {
        const optionElement = document.createElement('option');
        optionElement.value = option.id;
        optionElement.textContent = option.name;
        if (String(option.id) === String(selectedValue)) {
            optionElement.selected = true;
        }
        select.appendChild(optionElement);
    });
    
    return select;
}

// Функция для редактирования ячейки
async function makeCellEditable(cell, tableName, rowId, columnName) {
    const originalValue = cell.textContent.trim();
    let isUpdating = false;

    // Новый маппинг для связанных полей
    const editableField = EDITABLE_ID_FIELDS[tableName]?.[columnName];
    let relatedData = null;
    if (editableField) {
        const response = await fetch(`/get_related_data/${tableName}`);
        relatedData = await response.json();
    }

    let input;
    if (editableField && relatedData) {
        if (editableField === 'id_administrator' && relatedData.administrators) {
            // Исключаем владельца (id == 0 или name == '0') из выпадающего списка
            const filteredAdmins = relatedData.administrators.filter(admin => String(admin.id) !== '0' && admin.name !== '0');
            input = createSelect(filteredAdmins, getSelectedIdByName(filteredAdmins, originalValue));
        } else if (editableField === 'id_discount' && relatedData.discounts) {
            input = createSelect(relatedData.discounts, getSelectedIdByName(relatedData.discounts, originalValue));
        } else if (editableField === 'id_journey' && relatedData.journeys) {
            input = createSelect(relatedData.journeys, getSelectedIdByName(relatedData.journeys, originalValue));
        } else if (editableField === 'id_tourist' && relatedData.tourists) {
            input = createSelect(relatedData.tourists, getSelectedIdByName(relatedData.tourists, originalValue));
        } else if (editableField === 'booking_status' && relatedData.statuses) {
            input = createSelect(relatedData.statuses, getSelectedIdByName(relatedData.statuses, originalValue));
        } else {
            input = document.createElement('input');
            input.type = 'text';
            input.value = originalValue;
        }
    } else {
        // Обычный input
        input = document.createElement('input');
        input.type = 'text';
        input.value = originalValue;
    }

    // Заменяем содержимое ячейки на элемент ввода
    cell.innerHTML = '';
    cell.appendChild(input);
    input.focus();

    // Функция обновления значения
    async function updateValue() {
        if (isUpdating) return;
        isUpdating = true;

        try {
            const newValue = input.value.trim();
            console.log('Original value:', originalValue);
            console.log('New value:', newValue);
            console.log('Column key:', editableField);
            console.log('Related data:', relatedData);

            if (newValue === originalValue) {
                cell.textContent = originalValue;
                isUpdating = false;
        return;
            }

            // Формируем данные для обновления
            let valueToSend = newValue;
            const isRelatedField = editableField.startsWith('id_') || editableField === 'booking_status';

            // Для связанных полей преобразуем значение
            if (isRelatedField) {
                if (editableField === 'booking_status') {
                    // Для статуса бронирования используем ID из select
                    valueToSend = input.value;
                    if (!valueToSend) {
                        alert('Выберите статус бронирования!');
                        isUpdating = false;
                        return;
                    }
                } else if (relatedData) {
                    // Для других связанных полей
                    const relatedItems = 
                        editableField === 'id_discount' ? relatedData.discounts :
                        editableField === 'id_journey' ? relatedData.journeys :
                        editableField === 'id_tourist' ? relatedData.tourists :
                        editableField === 'id_administrator' ? relatedData.administrators : [];

                    console.log('Related items:', relatedItems);
                    console.log('Looking for value:', newValue);

                    // Находим ID по имени
                    const item = relatedItems?.find(item => item.name === newValue);
                    console.log('Found item:', item);

                    if (item) {
                        valueToSend = item.id.toString();
                    }
                }
            }

            if (!valueToSend) {
                alert('Значение не выбрано!');
                isUpdating = false;
                return;
            }

            const formData = {
                column: editableField,
                value: valueToSend,
                display_value: isRelatedField
            };

            console.log('Sending update request:', {
                url: `/update_cell/${tableName}/${rowId}`,
                data: formData
            });

            const response = await fetch(`/update_cell/${tableName}/${rowId}`, {
            method: 'POST',
            headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(formData)
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Server response:', errorText);
                throw new Error(`HTTP error! status: ${response.status}, response: ${errorText}`);
            }

        const result = await response.json();
            console.log('Update response:', result);

        if (result.success) {
                // Обновляем отображение ячейки
                if (editableField === 'booking_status') {
                    const statusClass = getStatusClass(parseInt(valueToSend));
                    cell.innerHTML = `<span class="status-badge ${statusClass}">${BOOKING_STATUS_MAPPING[valueToSend]}</span>`;
                } else if (isRelatedField && relatedData) {
                    // Для связанных полей отображаем имя
                    let displayName = newValue;
                    const relatedItems =
                        editableField === 'id_discount' ? relatedData.discounts :
                        editableField === 'id_journey' ? relatedData.journeys :
                        editableField === 'id_tourist' ? relatedData.tourists :
                        editableField === 'id_administrator' ? relatedData.administrators : [];
                    const found = relatedItems.find(item => String(item.id) === String(valueToSend));
                    if (found) displayName = found.name;
                    cell.textContent = displayName;
        } else {
                    cell.textContent = newValue;
                }
            } else {
                throw new Error(result.error || 'Ошибка при обновлении данных');
        }
    } catch (error) {
                console.error('Error updating cell:', error);
                console.error('Error details:', {
                    message: error.message,
                    stack: error.stack
                });
                cell.textContent = originalValue;
                alert(error.message || 'Произошла ошибка при обновлении данных');
            } finally {
                isUpdating = false;
            }
        }

        // Обработчики событий
        input.addEventListener('blur', updateValue);
        
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                updateValue();
            }
        });

        if (input.tagName === 'SELECT') {
            input.addEventListener('change', updateValue);
        }
}
