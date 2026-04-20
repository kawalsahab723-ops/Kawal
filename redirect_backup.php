<?php
include "config.php";

$status = $_GET['status'] ?? '';
$uid = $_GET['uid'] ?? '';
$pid = $_GET['pid'] ?? '';
$token = $_GET['token'] ?? '';
$ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';

// 🔐 Token verify
$expected_token = md5($uid . $pid . $status . $secret_key);

if ($token !== $expected_token) {
    die("Invalid Request ❌");
}

$allowed = ["complete", "terminate", "quota", "Securtyterminate"];
if (!in_array($status, $allowed)) {
    die("Invalid Status ❌");
}

// 💾 Save in DB (MySQL)
$stmt = $conn->prepare("INSERT INTO responses (user_id, project_id, status) VALUES (?, ?, ?)");
$stmt->bind_param("sss", $uid, $pid, $status);
$stmt->execute();

// UI Layout Logic
$title = "Survey Status";
$message = "Recording your response...";
$icon = "🤖";
$bg = "#f8fafc";

if ($status == "complete") {
    $title = "✅ Survey Completed";
    $message = "Your response has been successfully recorded. Thank you for your time!";
    $icon = "😊";
    $bg = "linear-gradient(135deg, #dcfce7 0%, #10b981 100%)";
} elseif ($status == "terminate") {
    $title = "❌ Survey Terminated";
    $message = "Unfortunately, you did not meet the criteria for this survey. We appreciate your effort!";
    $icon = "🙁";
    $bg = "linear-gradient(135deg, #fee2e2 0%, #ef4444 100%)";
} elseif ($status == "quota") {
    $title = "⚠️ Quota Full";
    $message = "The required number of responses for this survey has already been reached.";
    $icon = "⏳";
    $bg = "linear-gradient(135deg, #fef3c7 0%, #f59e0b 100%)";
} elseif ($status == "Securtyterminate") {
    $title = "🛡️ Security Terminate";
    $message = "Our systems detected an inconsistency. Your session has been terminated for security reasons.";
    $icon = "🔒";
    $bg = "linear-gradient(135deg, #e0e7ff 0%, #6366f1 100%)";
}
?>

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?php echo $title; ?> | Data Trovix</title>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;800&display=swap" rel="stylesheet">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Plus Jakarta Sans', sans-serif; }
        body { 
            height: 100vh; display: flex; align-items: center; justify-content: center; 
            background: <?php echo $bg; ?>; transition: background 0.5s ease;
        }
        .main-card {
            background: white; width: 90%; max-width: 600px; border-radius: 32px;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25); padding: 40px;
            text-align: center; animation: slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes slideUp { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
        .icon-box { 
            font-size: 80px; margin-bottom: 20px; width: 140px; height: 140px; 
            background: #f1f5f9; border-radius: 50%; display: flex; align-items: center; 
            justify-content: center; margin-left: auto; margin-right: auto;
        }
        h1 { font-size: 32px; font-weight: 800; color: #0f172a; margin-bottom: 12px; }
        .message { color: #64748b; font-size: 16px; line-height: 1.6; margin-bottom: 30px; }
        .details-grid {
            display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px;
            background: #f8fafc; padding: 20px; border-radius: 20px; border: 1px solid #e2e8f0;
        }
        .detail-item { text-align: center; }
        .detail-label { font-size: 10px; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px; }
        .detail-value { font-size: 14px; font-weight: 700; color: #1e293b; }
        .brand { margin-top: 30px; font-weight: 800; font-size: 14px; color: #94a3b8; letter-spacing: 2px; }
    </style>
</head>
<body>
    <div class="main-card">
        <div class="icon-box"><?php echo $icon; ?></div>
        <h1><?php echo $title; ?></h1>
        <p class="message"><?php echo $message; ?></p>
        
        <div class="details-grid">
            <div class="detail-item">
                <div class="detail-label">User ID</div>
                <div class="detail-value"><?php echo htmlspecialchars($uid); ?></div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Project ID</div>
                <div class="detail-value"><?php echo htmlspecialchars($pid); ?></div>
            </div>
            <div class="detail-item">
                <div class="detail-label">IP Address</div>
                <div class="detail-value"><?php echo htmlspecialchars($ip); ?></div>
            </div>
        </div>

        <div class="brand">DATA TROVIX SYSTEM</div>
    </div>
</body>
</html>
