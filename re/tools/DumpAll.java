// Ghidra 헤드리스 스크립트: 모든 함수를 디컴파일해 <이름>.c 로, 정의된 문자열과 참조 함수를 <이름>.strings.txt 로 저장한다.
import ghidra.app.script.GhidraScript;
import ghidra.app.decompiler.*;
import ghidra.program.model.listing.*;
import ghidra.program.model.symbol.*;
import java.io.*;
public class DumpAll extends GhidraScript {
  public void run() throws Exception {
    String outDir = getScriptArgs()[0];
    String name = currentProgram.getName();
    DecompInterface d = new DecompInterface();
    d.openProgram(currentProgram);
    PrintWriter pw = new PrintWriter(new FileWriter(outDir + "/" + name + ".c"));
    for (Function f : currentProgram.getFunctionManager().getFunctions(true)) {
      if (f.isThunk() || f.isExternal()) continue;
      DecompileResults r = d.decompileFunction(f, 60, monitor);
      pw.println("// ==== " + f.getName(true) + " @ " + f.getEntryPoint());
      if (r != null && r.decompileCompleted()) pw.println(r.getDecompiledFunction().getC());
      else pw.println("// decompile failed");
    }
    pw.close();
    PrintWriter sw = new PrintWriter(new FileWriter(outDir + "/" + name + ".strings.txt"));
    for (Data dt : currentProgram.getListing().getDefinedData(true)) {
      if (dt.hasStringValue()) {
        StringBuilder refs = new StringBuilder();
        for (Reference rf : getReferencesTo(dt.getAddress())) {
          Function fn = getFunctionContaining(rf.getFromAddress());
          refs.append(fn == null ? rf.getFromAddress().toString() : fn.getName()).append(" ");
        }
        sw.println(dt.getAddress() + "\t" + dt.getDefaultValueRepresentation() + "\t<- " + refs);
      }
    }
    sw.close();
  }
}
