// 간단한 테스트 파일
console.log('Test: Checking if openBoard is accessible');

// 페이지 로드 후 실행
window.addEventListener('DOMContentLoaded', function() {
    console.log('DOMContentLoaded fired');
    console.log('typeof window.openBoard:', typeof window.openBoard);
    console.log('typeof openBoard:', typeof openBoard);
    
    if (typeof window.openBoard === 'function') {
        console.log('✓ window.openBoard is accessible');
    } else {
        console.error('✗ window.openBoard is NOT accessible');
    }
});
