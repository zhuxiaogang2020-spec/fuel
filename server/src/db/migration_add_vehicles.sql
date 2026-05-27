-- 车辆管理表
CREATE TABLE IF NOT EXISTS vehicles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    name VARCHAR(64) NOT NULL DEFAULT '我的车',
    plate_number VARCHAR(32),
    model VARCHAR(128),
    last_grade ENUM('regular','mid','premium','diesel') DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- refuel_records 关联车辆
ALTER TABLE refuel_records
ADD COLUMN vehicle_id INT NULL AFTER user_id,
ADD INDEX idx_vehicle (vehicle_id);
