#!/bin/bash
sed -i 's/overflow-y-auto/flex flex-col/g' src/app/\(app\)/layout.tsx
sed -i 's/mx-auto w-full max-w-\[1600px\] px-4 pb-24 pt-7 md:px-8 lg:pt-9/mx-auto flex w-full max-w-[1600px] flex-1 flex-col min-h-0 px-4 pb-24 pt-7 md:px-8 lg:pt-9/g' src/app/\(app\)/layout.tsx
