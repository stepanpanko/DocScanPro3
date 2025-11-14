# kconv stub for Ruby 3.4 compatibility
module Kconv
  AUTO = 0
  EUC = 1
  SJIS = 2
  UTF8 = 3
  BINARY = 4
  ASCII = 5
  
  def self.toutf8(str, outcode = AUTO)
    str.dup.force_encoding('UTF-8')
  end
  
  def self.toutf16(str, outcode = AUTO)
    str.encode('UTF-16BE')
  end
  
  def self.toutf32(str, outcode = AUTO)
    str.encode('UTF-32BE')
  end
  
  def self.guess(str)
    str.encoding
  end
  
  def self.isutf8(str)
    str.encoding == Encoding::UTF_8
  end
end
