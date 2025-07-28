import React from 'react';

const Request = () => {
  return (
    <div className="w-full lg:p-16 md:p-8 sm:p-6 p-4">
      <div className="bg-primary rounded-tl-xl rounded-tr-xl w-full h-full flex items-center justify-between p-2 py-6 sm:p-4 md:p-8 overflow-hidden 3xl:py-24">
        {/* Text Content */}
        <div className="md:w-[60%] flex flex-col items-start gap-8 md:gap-16 3xl:gap-36 z-10">
          <div className="flex flex-col gap-8">
            <h2 className="text-[#41b6e6] text-2xl xs:text-3xl sm:text-4xl md:text-5xl 3xl:text-8xl font-bold">Lease your car today</h2>
            <p className="sm:text-lg md:text-xl text-white 3xl:text-3xl">
              Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut.
            </p>
          </div>
          <button className="bg-secondary px-6 sm:px-[30px] py-2 sm:py-[12px] 3xl:py-8 3xl:px-12 3xl:rounded-4xl rounded-3xl sm:text-xl font-semibold 3xl:text-3xl">
            Request a quote
          </button>
        </div>

        {/* Image Section */}
        <div className="md:flex items-end w-[60%] h-full hidden ">
          <img
            className="scale-[1.8] translate-y-[-15%] -translate-x-[10%]"
            src="/images/banner.png"
            alt="Car banner"
          />
        </div>
      </div>
    </div>
  );
};

export default Request;
