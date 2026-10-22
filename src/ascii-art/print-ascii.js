import fs from 'fs';

export const printAscii = (filepath) => {
    const contents = fs.readFileSync(filepath, 'utf8');
    console.log(contents);
}

export const printSplashScreen = () => {
    const filepath = new URL('./splash-screen.txt', import.meta.url);
    printAscii(filepath);
}