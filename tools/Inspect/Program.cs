using System.Reflection;
using System.Reflection.Emit;
using System.Reflection.Metadata;
using System.Reflection.Metadata.Ecma335;
using System.Reflection.PortableExecutable;

// Read IL only; never load or execute game code.
using var stream = File.OpenRead(args[0]);
using var pe = new PEReader(stream);
var reader = pe.GetMetadataReader();
var codes = typeof(OpCodes).GetFields(BindingFlags.Public | BindingFlags.Static)
 .Where(f => f.FieldType == typeof(OpCode)).Select(f => (OpCode)f.GetValue(null)!)
 .ToDictionary(c => unchecked((ushort)c.Value));
string Token(int token) {
 try {
  var handle=MetadataTokens.Handle(token);
  return handle.Kind switch {
   HandleKind.MethodDefinition => reader.GetString(reader.GetMethodDefinition((MethodDefinitionHandle)handle).Name),
   HandleKind.MemberReference => reader.GetString(reader.GetMemberReference((MemberReferenceHandle)handle).Name),
   HandleKind.FieldDefinition => reader.GetString(reader.GetFieldDefinition((FieldDefinitionHandle)handle).Name),
   HandleKind.TypeDefinition => reader.GetString(reader.GetTypeDefinition((TypeDefinitionHandle)handle).Name),
   HandleKind.TypeReference => reader.GetString(reader.GetTypeReference((TypeReferenceHandle)handle).Name),
   HandleKind.UserString => reader.GetUserString((UserStringHandle)handle),
   _ => $"0x{token:x8}"};
 } catch {return $"0x{token:x8}";}
}
foreach(var typeHandle in reader.TypeDefinitions) {
 var type=reader.GetTypeDefinition(typeHandle); var name=reader.GetString(type.Name);
 var queries=args.Skip(1).Where(q=>q.Split(':')[0]==name).ToArray();
 if(queries.Length==0)continue;
 Console.WriteLine($"TYPE {reader.GetString(type.Namespace)}.{name}");
 foreach(var methodHandle in type.GetMethods()) {
  var method=reader.GetMethodDefinition(methodHandle);
  if(method.RelativeVirtualAddress==0)continue;
  if(queries.Any(q=>q.EndsWith(":?"))){Console.WriteLine("METHOD "+reader.GetString(method.Name));continue;}
  if(!queries.Any(q=>!q.Contains(':') || q.Split(':')[1]==reader.GetString(method.Name)))continue;
  Console.WriteLine("METHOD "+reader.GetString(method.Name));
  var il=pe.GetMethodBody(method.RelativeVirtualAddress).GetILBytes()!;
  for(int pos=0;pos<il.Length;) {
   int start=pos;ushort code=il[pos++];if(code==0xfe)code=(ushort)(0xfe00|il[pos++]);
   var op=codes[code];string operand="";
   switch(op.OperandType) {
    case OperandType.InlineNone:break;
    case OperandType.ShortInlineI:operand=((sbyte)il[pos++]).ToString();break;
    case OperandType.ShortInlineVar:operand=il[pos++].ToString();break;
    case OperandType.InlineVar:operand=BitConverter.ToUInt16(il,pos).ToString();pos+=2;break;
    case OperandType.InlineI:operand=BitConverter.ToInt32(il,pos).ToString();pos+=4;break;
    case OperandType.InlineI8:operand=BitConverter.ToInt64(il,pos).ToString();pos+=8;break;
    case OperandType.ShortInlineR:operand=BitConverter.ToSingle(il,pos).ToString();pos+=4;break;
    case OperandType.InlineR:operand=BitConverter.ToDouble(il,pos).ToString();pos+=8;break;
    case OperandType.ShortInlineBrTarget:operand=(pos+1+(sbyte)il[pos]).ToString("x4");pos++;break;
    case OperandType.InlineBrTarget:operand=(pos+4+BitConverter.ToInt32(il,pos)).ToString("x4");pos+=4;break;
    case OperandType.InlineSwitch:var n=BitConverter.ToInt32(il,pos);pos+=4+4*n;operand=$"{n} targets";break;
    default:operand=Token(BitConverter.ToInt32(il,pos));pos+=4;break;
   }
   Console.WriteLine($" {start:x4} {op.Name} {operand}");
  }
 }
}
