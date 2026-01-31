export const generateOtp = () => {
    return Math.floor(1000 + Math.random() * 9000).toString();
} 

export const otpExpiryTime = 10 * 60 * 1000; // 10 minutes 