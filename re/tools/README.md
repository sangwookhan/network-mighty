# 분석 자료 재생성 도구

원작에서 나온 자료(디컴파일 코드, 꺼낸 그림, 시안 그림)는 제3자 저작물이라 저장소에 넣지 않는다 (`.gitignore`).
필요하면 원작 파일(`Mighty.exe`, `Xiao.dll`, `Ghost.dll`)이 있는 곳에서 아래 순서로 다시 만든다.
아래 예시의 `$ORIG` 는 원작 파일 폴더, `$RE` 는 이 저장소의 `re/` 폴더.

## 1. 디컴파일 (`re/decompiled/`)

Ghidra 12 (`brew install ghidra`) 헤드리스로 전체 함수를 디컴파일한다.

```bash
G=$(brew --prefix ghidra)/libexec/support/analyzeHeadless
mkdir -p /tmp/ghidra-proj "$RE/decompiled"
for f in Mighty.exe Xiao.dll Ghost.dll; do
  $G /tmp/ghidra-proj mighty -import "$ORIG/$f" -overwrite \
    -scriptPath "$RE/tools" -postScript DumpAll.java "$RE/decompiled"
done
```

## 2. 한글 문자열 주석 (`*.annotated.c`, `*.ko_strings.txt`)

Ghidra 는 CP949 문자열을 인식하지 못하므로, 주소별 한글 문자열 표를 만들어 코드에 `/*"..."*/` 주석으로 붙인다.

```bash
for f in Mighty.exe Xiao.dll Ghost.dll; do
  python3 "$RE/tools/annotate_cp949.py" "$ORIG/$f" "$RE/decompiled/$f.c" \
    "$RE/decompiled/$f.ko_strings.txt" "$RE/decompiled/$f.annotated.c"
done
```

## 3. 리소스 (`re/resources/`)

카드 그림(71×96, 710~762), 뒷면(770~780), 아이콘, 다이얼로그를 꺼낸다. Pillow 필요.

```bash
python3 "$RE/tools/extract_resources.py" "$ORIG/Mighty.exe" "$RE/resources"
```

## 4. 원작 화면 시안 (`re/mockups/`)

`04_screen_layout.md` 분석 결과를 원작 그림으로 그려 본 비교용 시안. 3번 결과가 있어야 한다.

```bash
python3 "$RE/tools/mockup/scenes.py"
```

`mockup/` 스크립트는 분석 에이전트가 작성한 것을 경로만 상대 경로로 바꿔 옮긴 것이다 (다시 실행해 보지는 않았음).
