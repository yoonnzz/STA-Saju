declare module "lunar-javascript" {
  class EightChar {
    setSect(value: number): void;
    getYear(): string;
    getMonth(): string;
    getDay(): string;
    getTime(): string;
    getYun(gender: number, sect?: number): Yun;
  }

  class LiuYue {
    getMonthInChinese(): string;
    getGanZhi(): string;
  }

  class LiuNian {
    getYear(): number;
    getAge(): number;
    getGanZhi(): string;
    getLiuYue(): LiuYue[];
  }

  class DaYun {
    getIndex(): number;
    getStartYear(): number;
    getEndYear(): number;
    getStartAge(): number;
    getEndAge(): number;
    getGanZhi(): string;
    getLiuNian(count?: number): LiuNian[];
  }

  class Yun {
    getStartYear(): number;
    getStartMonth(): number;
    getStartDay(): number;
    getStartHour(): number;
    isForward(): boolean;
    getDaYun(count?: number): DaYun[];
  }

  class Lunar {
    getEightChar(): EightChar;
  }

  class Solar {
    static fromYmdHms(
      year: number,
      month: number,
      day: number,
      hour: number,
      minute: number,
      second: number,
    ): Solar;
    getLunar(): Lunar;
  }

  const lunar: { Solar: typeof Solar };
  export default lunar;
}
