const express = require('express');
const axios = require('axios');
const NodeCache = require('node-cache'); // Để lưu cache dữ liệu lịch sử
const app = express();
const PORT = process.env.PORT || 3000;

// Khởi tạo cache với thời gian sống mặc định là 10 phút (600 giây)
// và kiểm tra định kỳ 2 phút một lần để xóa các mục hết hạn
const historicalDataCache = new NodeCache({ stdTTL: 600, checkperiod: 120 });

// URL của API Sunwin gốc
const SUNWIN_API_URL = 'https://sun-predict-5ghi.onrender.com/api/taixiu/history';

// Hàm mô phỏng thuật toán dự đoán Tài Xỉu
// Đây là một ví dụ RẤT ĐƠN GIẢN VÀ MINH HỌA.
// Để có thuật toán "xịn nhất", bạn cần triển khai logic phức tạp hơn nhiều.
function predictTaiXiu(history) {
    if (!history || history.length === 0) {
        return { du_doan: "Không đủ dữ liệu để dự đoán", do_tin_cay: 0, giai_thich: "Chưa có lịch sử phiên." };
    }

    // Lấy 10 phiên gần nhất để phân tích
    const recentHistory = history.slice(-10);

    let taiCount = 0;
    let xiuCount = 0;
    let taiSequence = 0;
    let xiuSequence = 0;
    let lastResult = null;

    recentHistory.forEach(item => {
        if (item.ket_qua === 'Tài') {
            taiCount++;
            if (lastResult === 'Tài') taiSequence++; else taiSequence = 1;
        } else {
            xiuCount++;
            if (lastResult === 'Xỉu') xiuSequence++; else xiuSequence = 1;
        }
        lastResult = item.ket_qua;
    });

    let du_doan = "Xỉu";
    let do_tin_cay = 60; // Mức độ tin cậy cơ bản
    let giai_thich = "Phân tích dựa trên các phiên gần nhất.";
    let pattern = "Không có mẫu hình rõ rệt.";

    // Ví dụ các logic dự đoán đơn giản:
    // 1. Nếu có một chuỗi dài Tài hoặc Xỉu
    if (taiSequence >= 3) {
        du_doan = "Xỉu"; // Thường có xu hướng bẻ cầu
        do_tin_cay = Math.min(90, 60 + taiSequence * 5); // Tăng độ tin cậy theo độ dài chuỗi
        giai_thich = `Xuất hiện chuỗi ${taiSequence} Tài liên tiếp. Có thể sẽ bẻ cầu về Xỉu.`;
        pattern = `Chuỗi Tài dài (${taiSequence} phiên)`;
    } else if (xiuSequence >= 3) {
        du_doan = "Tài"; // Thường có xu hướng bẻ cầu
        do_tin_cay = Math.min(90, 60 + xiuSequence * 5);
        giai_thich = `Xuất hiện chuỗi ${xiuSequence} Xỉu liên tiếp. Có thể sẽ bẻ cầu về Tài.`;
        pattern = `Chuỗi Xỉu dài (${xiuSequence} phiên)`;
    }
    // 2. Dựa trên tỷ lệ Tài/Xỉu trong các phiên gần đây
    else if (taiCount > xiuCount + 2) { // Nếu Tài áp đảo
        du_doan = "Xỉu"; // Dự đoán bẻ cầu
        do_tin_cay = 70;
        giai_thich = `Tỷ lệ Tài gần đây cao (${taiCount}/${recentHistory.length}). Có thể đảo chiều về Xỉu.`;
        pattern = "Tỷ lệ Tài cao";
    } else if (xiuCount > taiCount + 2) { // Nếu Xỉu áp đảo
        du_doan = "Tài"; // Dự đoán bẻ cầu
        do_tin_cay = 70;
        giai_thich = `Tỷ lệ Xỉu gần đây cao (${xiuCount}/${recentHistory.length}). Có thể đảo chiều về Tài.`;
        pattern = "Tỷ lệ Xỉu cao";
    }
    // 3. Mẫu hình "1-1" (Tài-Xỉu-Tài-Xỉu)
    else if (recentHistory.length >= 4 &&
             recentHistory[recentHistory.length - 1].ket_qua !== recentHistory[recentHistory.length - 2].ket_qua &&
             recentHistory[recentHistory.length - 2].ket_qua !== recentHistory[recentHistory.length - 3].ket_qua &&
             recentHistory[recentHistory.length - 3].ket_qua !== recentHistory[recentHistory.length - 4].ket_qua
    ) {
        du_doan = (lastResult === 'Tài') ? "Xỉu" : "Tài";
        do_tin_cay = 85;
        giai_thich = `Nhận thấy mẫu hình cầu 1-1 (${recentHistory[recentHistory.length-4].ket_qua}-${recentHistory[recentHistory.length-3].ket_qua}-${recentHistory[recentHistory.length-2].ket_qua}-${recentHistory[recentHistory.length-1].ket_qua}). Dự đoán tiếp tục cầu này.`;
        pattern = "Cầu 1-1";
    }
    // 4. Mẫu hình "2-1-2" (Tài-Tài-Xỉu-Tài-Tài) hoặc tương tự
    else if (recentHistory.length >= 5 &&
             recentHistory[recentHistory.length - 1].ket_qua === recentHistory[recentHistory.length - 2].ket_qua &&
             recentHistory[recentHistory.length - 3].ket_qua !== recentHistory[recentHistory.length - 2].ket_qua &&
             recentHistory[recentHistory.length - 4].ket_qua === recentHistory[recentHistory.length - 5].ket_qua &&
             recentHistory[recentHistory.length - 4].ket_qua === recentHistory[recentHistory.length - 1].ket_qua
    ) {
        du_doan = (lastResult === 'Tài') ? "Tài" : "Xỉu"; // Tiếp tục theo mẫu
        do_tin_cay = 80;
        giai_thich = `Nhận thấy mẫu hình cầu 2-1-2 hoặc tương tự. Dự đoán tiếp tục theo mẫu.`;
        pattern = "Cầu 2-1-2";
    }
    // 5. Dự đoán mặc định nếu không có mẫu hình mạnh
    else {
        // Có thể dùng tỷ lệ tổng quát từ lịch sử dài hơn
        du_doan = (taiCount >= xiuCount) ? "Xỉu" : "Tài"; // Cố gắng cân bằng
        do_tin_cay = 65;
        giai_thich = `Dựa trên phân tích cơ bản các phiên gần nhất.`;
        pattern = "Không có mẫu hình rõ ràng, dự đoán cân bằng.";
    }

    // Đảm bảo độ tin cậy trong khoảng 60-99.99
    do_tin_cay = Math.max(60, Math.min(99.99, do_tin_cay));

    return { du_doan, do_tin_cay, giai_thich, pattern };
}


// Endpoint chính của API của bạn
app.get('/api/taixiu/du_doan_sunwin', async (req, res) => {
    let currentData = null;
    let historicalData = historicalDataCache.get("full_history") || [];

    try {
        // Lấy dữ liệu phiên hiện tại từ API gốc
        const response = await axios.get(SUNWIN_API_URL);
        currentData = response.data;

        // Cập nhật lịch sử (chỉ thêm nếu là phiên mới)
        if (currentData && !historicalData.some(item => item.phien === currentData.phien)) {
            historicalData.push(currentData);
            // Giữ lại một số lượng phiên nhất định để tránh cache quá lớn
            const MAX_HISTORY_LENGTH = 100; // Có thể điều chỉnh
            if (historicalData.length > MAX_HISTORY_LENGTH) {
                historicalData = historicalData.slice(historicalData.length - MAX_HISTORY_LENGTH);
            }
            historicalDataCache.set("full_history", historicalData);
            console.log(`Đã thêm phiên ${currentData.phien} vào lịch sử. Tổng: ${historicalData.length}`);
        } else if (currentData) {
            console.log(`Phiên ${currentData.phien} đã có trong lịch sử.`);
        }

        // Thực hiện dự đoán dựa trên lịch sử đã có
        const { du_doan, do_tin_cay, giai_thich, pattern } = predictTaiXiu(historicalData);

        // Tạo đối tượng phản hồi theo yêu cầu của bạn
        const result = {
            phien_truoc: currentData ? currentData.phien : null,
            xuc_xac: currentData ? [currentData.xuc_xac_1, currentData.xuc_xac_2, currentData.xuc_xac_3] : [],
            tong_xuc_xac: currentData ? currentData.tong : null,
            ket_qua: currentData ? currentData.ket_qua : null,
            phien_sau: currentData ? currentData.phien + 1 : null,
            du_doan: du_doan,
            do_tin_cay: do_tin_cay,
            giai_thich: giai_thich,
            pattern: pattern
        };

        res.json(result);

    } catch (error) {
        console.error("Lỗi khi gọi API hoặc xử lý dữ liệu:", error.message);
        // Trả về lỗi nếu không thể lấy hoặc xử lý dữ liệu
        res.status(500).json({
            error: "Không thể lấy dữ liệu từ API gốc hoặc xử lý dự đoán.",
            details: error.message,
            du_doan: "Không thể dự đoán",
            do_tin_cay: 0,
            giai_thich: "Lỗi hệ thống hoặc không đủ dữ liệu.",
            pattern: "Lỗi"
        });
    }
});

// Endpoint mặc định (ví dụ)
app.get('/', (req, res) => {
    res.send('Chào mừng đến với API dự đoán Tài Xỉu! Truy cập /api/taixiu/du_doan_sunwin để xem dự đoán.');
});

// Bắt đầu server
app.listen(PORT, () => {
    console.log(`Server đang chạy trên cổng ${PORT}`);
});
