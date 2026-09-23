{
  function binary(head, tail) {
    return tail.reduce((left, item) => [item[1], left, item[3]], head);
  }
}

Module = _ "air1" !NameChar _ functions:Function+ { return ["air", 1, functions]; }
Function = name:Name _ "(" _ parameters:Parameters? ")" _ ":" _ result:Type _ "=" _ body:Expression _ ";" _ {
  return [name, parameters || [], result, body];
}
Parameters = head:Parameter tail:(_ "," _ Parameter)* _ { return [head, ...tail.map(item => item[3])]; }
Parameter = name:Name _ ":" _ type:Type { return [name, type]; }
Type = value:$("u" / "b") !NameChar { return value; }
Expression = Let / Conditional / BitOr
Let = "let" !NameChar _ name:Name _ "=" _ value:Expression _ "in" !NameChar _ body:Expression {
  return ["let", name, value, body];
}
Conditional = "if" !NameChar _ condition:Expression _ "then" !NameChar _ consequent:Expression _ "else" !NameChar _ alternate:Expression {
  return ["if", condition, consequent, alternate];
}
BitOr = head:BitXor tail:(_ "|" _ BitXor)* { return binary(head, tail); }
BitXor = head:BitAnd tail:(_ "^" _ BitAnd)* { return binary(head, tail); }
BitAnd = head:Equality tail:(_ "&" _ Equality)* { return binary(head, tail); }
Equality = head:Comparison tail:(_ $("==" / "!=") _ Comparison)* { return binary(head, tail); }
Comparison = head:Sum tail:(_ $("<=" / ">=" / "<" / ">") _ Sum)* { return binary(head, tail); }
Sum = head:Product tail:(_ $("+" / "-") _ Product)* { return binary(head, tail); }
Product = head:Unary tail:(_ "*" _ Unary)* { return binary(head, tail); }
Unary = "!" _ value:Unary { return ["!", value]; } / Atom
Atom = "(" _ value:Expression _ ")" { return value; }
  / "true" !NameChar { return true; }
  / "false" !NameChar { return false; }
  / value:$([0-9]+) !NameChar { return Number(value); }
  / name:Name _ "(" _ values:Arguments? ")" { return ["call", name, ...(values || [])]; }
  / Name
Arguments = head:Expression tail:(_ "," _ Expression)* _ { return [head, ...tail.map(item => item[3])]; }
Name = !Keyword value:$([A-Za-z] NameChar*) { return value; }
Keyword = ("let" / "in" / "if" / "then" / "else" / "true" / "false") !NameChar
NameChar = [A-Za-z0-9_]
_ = ([ \t\r\n] / "//" [^\r\n]*)*